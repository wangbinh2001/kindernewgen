import { and, asc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { classes, schoolYears } from "../db/schema";
import { withTenant } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid date");
const statusSchema = z.enum(["coming_soon", "active", "archived"]);
const createSchema = z
  .object({
    name: z.string().trim().min(1),
    startDate: dateSchema,
    endDate: dateSchema,
    status: statusSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.startDate < value.endDate,
    "End date must be after start date",
  );
const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    status: statusSchema.optional(),
  })
  .strict()
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

export const schoolYearRoutes = new Hono();
const readRoles = ["school_admin", "staff", "teacher"] as const;

schoolYearRoutes.get(
  "/",
  requireAuth,
  requireRole(...readRoles),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(schoolYears)
          .where(eq(schoolYears.schoolId, schoolId))
          .orderBy(asc(schoolYears.createdAt), asc(schoolYears.id)),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

schoolYearRoutes.get(
  "/:id",
  requireAuth,
  requireRole(...readRoles),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(schoolYears)
          .where(
            and(
              eq(schoolYears.id, context.req.param("id")!),
              eq(schoolYears.schoolId, schoolId),
            ),
          ),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "School year not found");
    } catch {
      return internalError(context);
    }
  },
);

schoolYearRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = createSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        if (parsed.data.status === "active")
          await tx
            .update(schoolYears)
            .set({ status: "archived" })
            .where(eq(schoolYears.status, "active"));
        const [created] = await tx
          .insert(schoolYears)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            ...parsed.data,
            status: parsed.data.status ?? "coming_soon",
          })
          .returning();
        return created;
      });
      return context.json({ success: true, data, error: null }, 201);
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "School year name already exists")
        : internalError(context);
    }
  },
);

schoolYearRoutes.put(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = updateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [current] = await tx
          .select()
          .from(schoolYears)
          .where(
            and(
              eq(schoolYears.id, context.req.param("id")!),
              eq(schoolYears.schoolId, schoolId),
            ),
          );
        if (!current) return null;
        const startDate = parsed.data.startDate ?? current.startDate;
        const endDate = parsed.data.endDate ?? current.endDate;
        if (startDate >= endDate) return "invalid_dates" as const;
        if (parsed.data.status === "active")
          await tx
            .update(schoolYears)
            .set({ status: "archived" })
            .where(
              and(
                eq(schoolYears.status, "active"),
                ne(schoolYears.id, current.id),
              ),
            );
        const [updated] = await tx
          .update(schoolYears)
          .set(parsed.data)
          .where(eq(schoolYears.id, current.id))
          .returning();
        return updated;
      });
      if (data === null) return notFoundError(context, "School year not found");
      if (data === "invalid_dates")
        return validationError(context, "End date must be after start date");
      return context.json({ success: true, data, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "School year name already exists")
        : internalError(context);
    }
  },
);

schoolYearRoutes.delete(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [year] = await tx
          .select({ id: schoolYears.id })
          .from(schoolYears)
          .where(
            and(
              eq(schoolYears.id, context.req.param("id")!),
              eq(schoolYears.schoolId, schoolId),
            ),
          );
        if (!year) return "missing" as const;
        const [classRow] = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.schoolYearId, year.id));
        if (classRow) return "has_classes" as const;
        await tx.delete(schoolYears).where(eq(schoolYears.id, year.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "School year not found");
      if (result === "has_classes")
        return validationError(context, "School year has classes");
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);

schoolYearRoutes.patch(
  "/:id/close",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [year] = await tx
          .update(schoolYears)
          .set({ status: "archived" })
          .where(
            and(
              eq(schoolYears.id, context.req.param("id")!),
              eq(schoolYears.schoolId, schoolId),
            ),
          )
          .returning();
        if (!year) return null;
        await tx
          .update(classes)
          .set({ status: "archived" })
          .where(eq(classes.schoolYearId, year.id));
        return year;
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "School year not found");
    } catch {
      return internalError(context);
    }
  },
);

schoolYearRoutes.post(
  "/:id/activate",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [year] = await tx
          .select({ id: schoolYears.id })
          .from(schoolYears)
          .where(
            and(
              eq(schoolYears.id, context.req.param("id")!),
              eq(schoolYears.schoolId, schoolId),
            ),
          );
        if (!year) return null;
        await tx
          .update(schoolYears)
          .set({ status: "archived" })
          .where(
            and(
              eq(schoolYears.schoolId, schoolId),
              eq(schoolYears.status, "active"),
              ne(schoolYears.id, year.id),
            ),
          );
        const [updated] = await tx
          .update(schoolYears)
          .set({ status: "active" })
          .where(eq(schoolYears.id, year.id))
          .returning();
        return updated;
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "School year not found");
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Only one active school year is allowed")
        : internalError(context);
    }
  },
);
