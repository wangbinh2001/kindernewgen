import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { optionalFees } from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const createSchema = z
  .object({
    name: z.string().trim().min(1),
    amount: z.number().int().min(0),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict();
const updateSchema = createSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

async function readJson(context: Context) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function schoolIdOf(context: Context) {
  return (context.get("auth").claims as TenantAccessTokenClaims).school_id;
}

export const optionalFeeRoutes = new Hono();
const readRoles = ["school_admin", "staff", "teacher"] as const;

optionalFeeRoutes.get(
  "/",
  requireAuth,
  requireRole(...readRoles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(optionalFees)
          .where(eq(optionalFees.schoolId, schoolId))
          .orderBy(asc(optionalFees.createdAt), asc(optionalFees.id)),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

optionalFeeRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = createSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid optional fee");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .insert(optionalFees)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            ...parsed.data,
          })
          .returning(),
      );
      return context.json({ success: true, data, error: null }, 201);
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Optional fee name already exists")
        : internalError(context);
    }
  },
);

optionalFeeRoutes.put(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = updateSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid optional fee");
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .update(optionalFees)
          .set(parsed.data)
          .where(
            and(
              eq(optionalFees.id, context.req.param("id")!),
              eq(optionalFees.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Optional fee not found");
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Optional fee name already exists")
        : internalError(context);
    }
  },
);

optionalFeeRoutes.delete(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .update(optionalFees)
          .set({ status: "inactive" })
          .where(
            and(
              eq(optionalFees.id, context.req.param("id")!),
              eq(optionalFees.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Optional fee not found");
    } catch {
      return internalError(context);
    }
  },
);
