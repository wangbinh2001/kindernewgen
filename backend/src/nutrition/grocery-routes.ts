import { and, asc, count, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  foodItems,
  grocerySheetItems,
  grocerySheets,
  ingredients,
  menus,
  operatingCosts,
  recipes,
  students,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const monthSchema = dateSchema.refine((value) => value.endsWith("-01"));
const costSchema = z
  .object({
    month: monthSchema,
    electricityCost: z.coerce.number().nonnegative(),
    gasCost: z.coerce.number().nonnegative(),
    note: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
const costUpdateSchema = costSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const rangeSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema })
  .strict()
  .refine((value) => value.startDate <= value.endDate);
const confirmSchema = z
  .object({ actualTotal: z.coerce.number().nonnegative() })
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

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function costResponse(row: typeof operatingCosts.$inferSelect) {
  return {
    ...row,
    electricityCost: Number(row.electricityCost),
    gasCost: Number(row.gasCost),
  };
}

function sheetResponse(
  row: typeof grocerySheets.$inferSelect,
  items: Array<{
    id: string;
    grocerySheetId: string;
    ingredientId: string;
    ingredientName: string;
    unit: string;
    totalQuantity: string;
    totalPrice: string;
    note: string | null;
  }>,
) {
  return {
    ...row,
    totalFoodCost: Number(row.totalFoodCost),
    electricityCost: Number(row.electricityCost),
    gasCost: Number(row.gasCost),
    estimatedTotal: Number(row.estimatedTotal),
    actualTotal: row.actualTotal === null ? null : Number(row.actualTotal),
    items: items.map((item) => ({
      ...item,
      totalQuantity: Number(item.totalQuantity),
      totalPrice: Number(item.totalPrice),
    })),
  };
}

async function readSheet(tx: TenantTransaction, schoolId: string, id: string) {
  const [sheet] = await tx
    .select()
    .from(grocerySheets)
    .where(and(eq(grocerySheets.id, id), eq(grocerySheets.schoolId, schoolId)));
  if (!sheet) return null;
  const items = await tx
    .select({
      id: grocerySheetItems.id,
      grocerySheetId: grocerySheetItems.grocerySheetId,
      ingredientId: grocerySheetItems.ingredientId,
      ingredientName: ingredients.name,
      unit: grocerySheetItems.unit,
      totalQuantity: grocerySheetItems.totalQuantity,
      totalPrice: grocerySheetItems.totalPrice,
      note: grocerySheetItems.note,
    })
    .from(grocerySheetItems)
    .innerJoin(ingredients, eq(ingredients.id, grocerySheetItems.ingredientId))
    .where(eq(grocerySheetItems.grocerySheetId, sheet.id))
    .orderBy(asc(ingredients.name), asc(ingredients.id));
  return sheetResponse(sheet, items);
}

export const groceryRoutes = new Hono();
const roles = ["school_admin", "staff"] as const;

groceryRoutes.get(
  "/operating-costs",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const rows = await tx
          .select()
          .from(operatingCosts)
          .where(eq(operatingCosts.schoolId, schoolId))
          .orderBy(asc(operatingCosts.month), asc(operatingCosts.id));
        return rows.map(costResponse);
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

groceryRoutes.post(
  "/operating-costs",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = costSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid operating cost");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .insert(operatingCosts)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            month: parsed.data.month,
            electricityCost: parsed.data.electricityCost.toFixed(2),
            gasCost: parsed.data.gasCost.toFixed(2),
            note: parsed.data.note,
          })
          .returning(),
      );
      return context.json(
        { success: true, data: data ? costResponse(data) : null, error: null },
        201,
      );
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Operating cost for month already exists")
        : internalError(context);
    }
  },
);

groceryRoutes.put(
  "/operating-costs/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = costUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid operating cost");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .update(operatingCosts)
          .set({
            ...(parsed.data.month === undefined
              ? {}
              : { month: parsed.data.month }),
            ...(parsed.data.electricityCost === undefined
              ? {}
              : { electricityCost: parsed.data.electricityCost.toFixed(2) }),
            ...(parsed.data.gasCost === undefined
              ? {}
              : { gasCost: parsed.data.gasCost.toFixed(2) }),
            ...(parsed.data.note === undefined
              ? {}
              : { note: parsed.data.note }),
          })
          .where(
            and(
              eq(operatingCosts.id, context.req.param("id")!),
              eq(operatingCosts.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({
            success: true,
            data: costResponse(data),
            error: null,
          })
        : notFoundError(context, "Operating cost not found");
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Operating cost for month already exists")
        : internalError(context);
    }
  },
);

groceryRoutes.delete(
  "/operating-costs/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .delete(operatingCosts)
          .where(
            and(
              eq(operatingCosts.id, context.req.param("id")!),
              eq(operatingCosts.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({ success: true, data: null, error: null })
        : notFoundError(context, "Operating cost not found");
    } catch {
      return internalError(context);
    }
  },
);

groceryRoutes.get(
  "/grocery-sheets/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, (tx) =>
        readSheet(tx, schoolId, context.req.param("id")!),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Grocery sheet not found");
    } catch {
      return internalError(context);
    }
  },
);

groceryRoutes.post(
  "/grocery-sheets/generate",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = rangeSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid date range");
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [studentCountRow] = await tx
          .select({ total: count() })
          .from(students)
          .where(
            and(eq(students.schoolId, schoolId), eq(students.status, "active")),
          );
        const totalStudents = Number(studentCountRow?.total ?? 0);
        const rows = await tx
          .select({
            ingredientId: ingredients.id,
            ingredientName: ingredients.name,
            unit: ingredients.unit,
            quantityPerStudent: recipes.quantityPerStudent,
            pricePerUnit: ingredients.pricePerUnit,
          })
          .from(menus)
          .innerJoin(recipes, eq(recipes.foodItemId, menus.foodItemId))
          .innerJoin(ingredients, eq(ingredients.id, recipes.ingredientId))
          .innerJoin(foodItems, eq(foodItems.id, menus.foodItemId))
          .where(
            and(
              eq(menus.schoolId, schoolId),
              gte(menus.date, parsed.data.startDate),
              lte(menus.date, parsed.data.endDate),
              eq(foodItems.schoolId, schoolId),
            ),
          );
        const grouped = new Map<
          string,
          {
            ingredientName: string;
            unit: string;
            quantity: number;
            price: number;
          }
        >();
        for (const row of rows) {
          const current = grouped.get(row.ingredientId) ?? {
            ingredientName: row.ingredientName,
            unit: row.unit,
            quantity: 0,
            price: Number(row.pricePerUnit),
          };
          current.quantity += Number(row.quantityPerStudent) * totalStudents;
          grouped.set(row.ingredientId, current);
        }
        const items = Array.from(grouped, ([ingredientId, value]) => {
          const totalQuantity = round2(value.quantity);
          return {
            ingredientId,
            ingredientName: value.ingredientName,
            unit: value.unit,
            totalQuantity,
            totalPrice: round2(totalQuantity * value.price),
          };
        });
        const totalFoodCost = round2(
          items.reduce((sum, item) => sum + item.totalPrice, 0),
        );
        const firstMonth = `${parsed.data.startDate.slice(0, 7)}-01`;
        const lastMonth = `${parsed.data.endDate.slice(0, 7)}-01`;
        const costs = await tx
          .select()
          .from(operatingCosts)
          .where(
            and(
              eq(operatingCosts.schoolId, schoolId),
              gte(operatingCosts.month, firstMonth),
              lte(operatingCosts.month, lastMonth),
            ),
          );
        const electricityCost = round2(
          costs.reduce((sum, cost) => sum + Number(cost.electricityCost), 0),
        );
        const gasCost = round2(
          costs.reduce((sum, cost) => sum + Number(cost.gasCost), 0),
        );
        const estimatedTotal = round2(
          totalFoodCost - electricityCost - gasCost,
        );
        const [sheet] = await tx
          .insert(grocerySheets)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
            totalStudents,
            totalFoodCost: totalFoodCost.toFixed(2),
            electricityCost: electricityCost.toFixed(2),
            gasCost: gasCost.toFixed(2),
            estimatedTotal: estimatedTotal.toFixed(2),
            status: "draft",
          })
          .returning();
        if (!sheet) throw new Error("Grocery sheet was not created");
        if (items.length) {
          await tx.insert(grocerySheetItems).values(
            items.map((item) => ({
              id: crypto.randomUUID(),
              grocerySheetId: sheet.id,
              ingredientId: item.ingredientId,
              totalQuantity: item.totalQuantity.toFixed(4),
              unit: item.unit,
              totalPrice: item.totalPrice.toFixed(2),
            })),
          );
        }
        return readSheet(tx, schoolId, sheet.id);
      });
      if (!data) return internalError(context);
      return context.json({ success: true, data, error: null }, 201);
    } catch {
      return internalError(context);
    }
  },
);

groceryRoutes.patch(
  "/grocery-sheets/:id/confirm",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = confirmSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid actual total");
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [sheet] = await tx
          .select()
          .from(grocerySheets)
          .where(
            and(
              eq(grocerySheets.id, context.req.param("id")!),
              eq(grocerySheets.schoolId, schoolId),
            ),
          );
        if (!sheet) return { kind: "missing" as const };
        if (sheet.status === "confirmed") return { kind: "confirmed" as const };
        const [updated] = await tx
          .update(grocerySheets)
          .set({
            status: "confirmed",
            actualTotal: parsed.data.actualTotal.toFixed(2),
          })
          .where(eq(grocerySheets.id, sheet.id))
          .returning();
        return updated
          ? {
              kind: "saved" as const,
              data: await readSheet(tx, schoolId, updated.id),
            }
          : { kind: "missing" as const };
      });
      if (result.kind === "missing")
        return notFoundError(context, "Grocery sheet not found");
      if (result.kind === "confirmed")
        return validationError(context, "Grocery sheet is already confirmed");
      return context.json({ success: true, data: result.data, error: null });
    } catch {
      return internalError(context);
    }
  },
);
