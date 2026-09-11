import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { foodItems, ingredients, recipes } from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const categorySchema = z.enum([
  "breakfast",
  "lunch_main",
  "lunch_soup",
  "snack",
]);
const foodSchema = z
  .object({
    name: z.string().trim().min(1),
    category: categorySchema,
    description: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
const foodUpdateSchema = foodSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const ingredientSchema = z
  .object({
    name: z.string().trim().min(1),
    unit: z.enum(["g", "ml"]),
    pricePerUnit: z.coerce.number().nonnegative(),
  })
  .strict();
const ingredientUpdateSchema = ingredientSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const recipeSchema = z
  .object({
    foodItemId: z.string().min(1),
    ingredients: z
      .array(
        z
          .object({
            ingredientId: z.string().min(1),
            quantityPerStudent: z.coerce.number().positive(),
          })
          .strict(),
      )
      .refine(
        (items) =>
          new Set(items.map((item) => item.ingredientId)).size === items.length,
        "Duplicate ingredients are not allowed",
      ),
  })
  .strict();

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function schoolIdOf(context: Context) {
  return (context.get("auth").claims as TenantAccessTokenClaims).school_id;
}

function ingredientResponse(row: typeof ingredients.$inferSelect) {
  return { ...row, pricePerUnit: Number(row.pricePerUnit) };
}

export const nutritionRoutes = new Hono();
const roles = ["school_admin", "staff"] as const;

nutritionRoutes.get(
  "/food-items",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(foodItems)
          .where(eq(foodItems.schoolId, schoolId))
          .orderBy(asc(foodItems.createdAt), asc(foodItems.id)),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

nutritionRoutes.get(
  "/food-items/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [food] = await tx
          .select()
          .from(foodItems)
          .where(
            and(
              eq(foodItems.id, context.req.param("id")!),
              eq(foodItems.schoolId, schoolId),
            ),
          );
        if (!food) return null;
        const linked = await tx
          .select({
            id: recipes.id,
            ingredientId: ingredients.id,
            ingredientName: ingredients.name,
            unit: ingredients.unit,
            quantityPerStudent: recipes.quantityPerStudent,
            createdAt: recipes.createdAt,
          })
          .from(recipes)
          .innerJoin(ingredients, eq(ingredients.id, recipes.ingredientId))
          .where(eq(recipes.foodItemId, food.id))
          .orderBy(asc(ingredients.name), asc(ingredients.id));
        return {
          ...food,
          recipes: linked.map((row) => ({
            ...row,
            quantityPerStudent: Number(row.quantityPerStudent),
          })),
        };
      });
      return result
        ? context.json({ success: true, data: result, error: null })
        : notFoundError(context, "Food item not found");
    } catch {
      return internalError(context);
    }
  },
);

nutritionRoutes.post(
  "/food-items",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = foodSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid food item");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .insert(foodItems)
          .values({ id: crypto.randomUUID(), schoolId, ...parsed.data })
          .returning(),
      );
      return context.json({ success: true, data, error: null }, 201);
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Food item name already exists")
        : internalError(context);
    }
  },
);

nutritionRoutes.put(
  "/food-items/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = foodUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid food item");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .update(foodItems)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(
            and(
              eq(foodItems.id, context.req.param("id")!),
              eq(foodItems.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Food item not found");
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Food item name already exists")
        : internalError(context);
    }
  },
);

nutritionRoutes.delete(
  "/food-items/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [food] = await tx
          .select({ id: foodItems.id })
          .from(foodItems)
          .where(
            and(
              eq(foodItems.id, context.req.param("id")!),
              eq(foodItems.schoolId, schoolId),
            ),
          );
        if (!food) return "missing" as const;
        const [recipe] = await tx
          .select({ id: recipes.id })
          .from(recipes)
          .where(eq(recipes.foodItemId, food.id));
        if (recipe) return "has_recipe" as const;
        await tx.delete(foodItems).where(eq(foodItems.id, food.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Food item not found");
      if (result === "has_recipe")
        return validationError(context, "Food item is used by a recipe");
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);

nutritionRoutes.get(
  "/ingredients",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const rows = await tx
          .select()
          .from(ingredients)
          .where(eq(ingredients.schoolId, schoolId))
          .orderBy(asc(ingredients.createdAt), asc(ingredients.id));
        return rows.map(ingredientResponse);
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

nutritionRoutes.post(
  "/ingredients",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = ingredientSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid ingredient");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .insert(ingredients)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            name: parsed.data.name,
            unit: parsed.data.unit,
            pricePerUnit: parsed.data.pricePerUnit.toFixed(4),
          })
          .returning(),
      );
      return context.json(
        {
          success: true,
          data: data ? ingredientResponse(data) : null,
          error: null,
        },
        201,
      );
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Ingredient name already exists")
        : internalError(context);
    }
  },
);

nutritionRoutes.put(
  "/ingredients/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = ingredientUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid ingredient");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .update(ingredients)
          .set({
            ...(parsed.data.name === undefined
              ? {}
              : { name: parsed.data.name }),
            ...(parsed.data.unit === undefined
              ? {}
              : { unit: parsed.data.unit }),
            ...(parsed.data.pricePerUnit === undefined
              ? {}
              : { pricePerUnit: parsed.data.pricePerUnit.toFixed(4) }),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ingredients.id, context.req.param("id")!),
              eq(ingredients.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({
            success: true,
            data: ingredientResponse(data),
            error: null,
          })
        : notFoundError(context, "Ingredient not found");
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Ingredient name already exists")
        : internalError(context);
    }
  },
);

nutritionRoutes.delete(
  "/ingredients/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [ingredient] = await tx
          .select({ id: ingredients.id })
          .from(ingredients)
          .where(
            and(
              eq(ingredients.id, context.req.param("id")!),
              eq(ingredients.schoolId, schoolId),
            ),
          );
        if (!ingredient) return "missing" as const;
        const [recipe] = await tx
          .select({ id: recipes.id })
          .from(recipes)
          .where(eq(recipes.ingredientId, ingredient.id));
        if (recipe) return "has_recipe" as const;
        await tx.delete(ingredients).where(eq(ingredients.id, ingredient.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Ingredient not found");
      if (result === "has_recipe")
        return validationError(context, "Ingredient is used by a recipe");
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);

nutritionRoutes.post(
  "/recipes",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = recipeSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid recipe");
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [food] = await tx
          .select({ id: foodItems.id })
          .from(foodItems)
          .where(
            and(
              eq(foodItems.id, parsed.data.foodItemId),
              eq(foodItems.schoolId, schoolId),
            ),
          );
        if (!food) return { kind: "food_missing" as const };
        const ids = parsed.data.ingredients.map((item) => item.ingredientId);
        const owned = ids.length
          ? await tx
              .select({ id: ingredients.id })
              .from(ingredients)
              .where(
                and(
                  eq(ingredients.schoolId, schoolId),
                  inArray(ingredients.id, ids),
                ),
              )
          : [];
        if (owned.length !== ids.length) {
          return { kind: "ingredient_missing" as const };
        }
        await tx.delete(recipes).where(eq(recipes.foodItemId, food.id));
        const data = parsed.data.ingredients.length
          ? await tx
              .insert(recipes)
              .values(
                parsed.data.ingredients.map((item) => ({
                  id: crypto.randomUUID(),
                  foodItemId: food.id,
                  ingredientId: item.ingredientId,
                  quantityPerStudent: item.quantityPerStudent.toFixed(4),
                })),
              )
              .returning()
          : [];
        return { kind: "saved" as const, data };
      });
      if (result.kind === "food_missing")
        return notFoundError(context, "Food item not found");
      if (result.kind === "ingredient_missing")
        return validationError(context, "Ingredient not found in this school");
      return context.json({
        success: true,
        data: result.data.map((row) => ({
          ...row,
          quantityPerStudent: Number(row.quantityPerStudent),
        })),
        error: null,
      });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Duplicate ingredient in recipe")
        : internalError(context);
    }
  },
);
