import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { foodItems, menus } from "../db/schema";
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
const itemSchema = z
  .object({
    mealType: z.enum(["breakfast", "lunch", "snack"]),
    foodItemId: z.string().min(1),
  })
  .strict();
const createSchema = z
  .object({ date: dateSchema, items: z.array(itemSchema) })
  .strict()
  .superRefine((value, ctx) => {
    const keys = value.items.map(
      (item) => `${item.mealType}:${item.foodItemId}`,
    );
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate menu item" });
    }
  });

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

async function listMenuRows(
  tx: TenantTransaction,
  schoolId: string,
  startDate: string,
  endDate: string,
) {
  return tx
    .select({
      id: menus.id,
      schoolId: menus.schoolId,
      date: menus.date,
      mealType: menus.mealType,
      foodItemId: menus.foodItemId,
      createdAt: menus.createdAt,
      foodName: foodItems.name,
    })
    .from(menus)
    .innerJoin(foodItems, eq(foodItems.id, menus.foodItemId))
    .where(
      and(
        eq(menus.schoolId, schoolId),
        gte(menus.date, startDate),
        lte(menus.date, endDate),
      ),
    )
    .orderBy(asc(menus.date), asc(menus.mealType), asc(menus.id));
}

export const menuRoutes = new Hono();
const roles = ["school_admin", "staff"] as const;

menuRoutes.get("/", requireAuth, requireRole(...roles), async (context) => {
  const startDate = context.req.query("startDate");
  const endDate = context.req.query("endDate");
  const start = dateSchema.safeParse(startDate);
  const end = dateSchema.safeParse(endDate);
  if (!start.success || !end.success || start.data > end.data) {
    return validationError(context, "startDate and endDate are required");
  }
  const schoolId = schoolIdOf(context);
  try {
    const data = await withTenant(schoolId, (tx) =>
      listMenuRows(tx, schoolId, start.data, end.data),
    );
    return context.json({ success: true, data, error: null });
  } catch {
    return internalError(context);
  }
});

menuRoutes.post("/", requireAuth, requireRole(...roles), async (context) => {
  const parsed = createSchema.safeParse(await readJson(context));
  if (!parsed.success) return validationError(context, "Invalid menu");
  const schoolId = schoolIdOf(context);
  try {
    const result = await withTenant(schoolId, async (tx) => {
      const ids = parsed.data.items.map((item) => item.foodItemId);
      const foods = ids.length
        ? await tx
            .select({ id: foodItems.id })
            .from(foodItems)
            .where(
              and(eq(foodItems.schoolId, schoolId), inArray(foodItems.id, ids)),
            )
        : [];
      if (foods.length !== new Set(ids).size) {
        return { kind: "invalid_food" as const };
      }
      await tx
        .delete(menus)
        .where(
          and(eq(menus.schoolId, schoolId), eq(menus.date, parsed.data.date)),
        );
      if (parsed.data.items.length) {
        await tx.insert(menus).values(
          parsed.data.items.map((item) => ({
            id: crypto.randomUUID(),
            schoolId,
            date: parsed.data.date,
            mealType: item.mealType,
            foodItemId: item.foodItemId,
          })),
        );
      }
      return {
        kind: "saved" as const,
        data: await listMenuRows(
          tx,
          schoolId,
          parsed.data.date,
          parsed.data.date,
        ),
      };
    });
    if (result.kind === "invalid_food") {
      return validationError(context, "Food item not found in this school");
    }
    return context.json({ success: true, data: result.data, error: null });
  } catch (error) {
    return isUniqueViolation(error)
      ? validationError(context, "Duplicate menu item")
      : internalError(context);
  }
});
