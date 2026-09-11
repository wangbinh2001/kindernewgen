import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { classes, feeSchedules } from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import { getClientIp, recordAuditLog } from "../db/audit";
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
    type: z.enum(["basic", "meal", "overtime"]),
    classId: z.string().min(1).nullable().optional(),
    cycle: z.enum(["monthly", "yearly"]).optional(),
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

async function validClass(
  tx: TenantTransaction,
  schoolId: string,
  classId: string,
) {
  const [row] = await tx
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, schoolId)));
  return row;
}

export const feeScheduleRoutes = new Hono();

feeScheduleRoutes.get(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(feeSchedules)
          .where(eq(feeSchedules.schoolId, schoolId))
          .orderBy(asc(feeSchedules.createdAt), asc(feeSchedules.id)),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

feeScheduleRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = createSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid fee schedule");
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        if (parsed.data.classId) {
          const row = await validClass(tx, schoolId, parsed.data.classId);
          if (!row) return { kind: "invalid_class" as const };
        }
        const [data] = await tx
          .insert(feeSchedules)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            ...parsed.data,
            cycle: parsed.data.cycle ?? "monthly",
            status: parsed.data.status ?? "active",
          })
          .returning();

        await recordAuditLog(tx, {
          actorId: (context.get("auth").claims as TenantAccessTokenClaims).sub,
          schoolId,
          action: "create_fee_schedule",
          targetType: "fee_schedules",
          targetId: data!.id,
          after: data,
          ipAddress: getClientIp(context),
        });

        return { kind: "created" as const, data };
      });
      if (result.kind === "invalid_class") {
        return validationError(context, "Class not found in this school");
      }
      return context.json(
        { success: true, data: result.data, error: null },
        201,
      );
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Fee schedule name already exists")
        : internalError(context);
    }
  },
);

feeScheduleRoutes.put(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = updateSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid fee schedule");
    const schoolId = schoolIdOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        if (parsed.data.classId) {
          const row = await validClass(tx, schoolId, parsed.data.classId);
          if (!row) return { kind: "invalid_class" as const };
        }
        const [existing] = await tx
          .select()
          .from(feeSchedules)
          .where(
            and(
              eq(feeSchedules.id, context.req.param("id")!),
              eq(feeSchedules.schoolId, schoolId),
            ),
          );
        if (!existing) return { kind: "not_found" as const };

        const [data] = await tx
          .update(feeSchedules)
          .set(parsed.data)
          .where(
            and(
              eq(feeSchedules.id, context.req.param("id")!),
              eq(feeSchedules.schoolId, schoolId),
            ),
          )
          .returning();

        if (data) {
          await recordAuditLog(tx, {
            actorId: (context.get("auth").claims as TenantAccessTokenClaims).sub,
            schoolId,
            action: "update_fee_schedule",
            targetType: "fee_schedules",
            targetId: data.id,
            before: existing,
            after: data,
            ipAddress: getClientIp(context),
          });
        }

        return data
          ? { kind: "updated" as const, data }
          : { kind: "not_found" as const };
      });
      if (result.kind === "invalid_class") {
        return validationError(context, "Class not found in this school");
      }
      return result.kind === "not_found"
        ? notFoundError(context, "Fee schedule not found")
        : context.json({ success: true, data: result.data, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Fee schedule name already exists")
        : internalError(context);
    }
  },
);

feeScheduleRoutes.delete(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const [data] = await withTenant(schoolId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(feeSchedules)
          .where(
            and(
              eq(feeSchedules.id, context.req.param("id")!),
              eq(feeSchedules.schoolId, schoolId),
            ),
          );
        if (!existing) return [];
        const updated = await tx
          .update(feeSchedules)
          .set({ status: "inactive" })
          .where(eq(feeSchedules.id, existing.id))
          .returning();
        if (updated[0]) {
          await recordAuditLog(tx, {
            actorId: (context.get("auth").claims as TenantAccessTokenClaims).sub,
            schoolId,
            action: "deactivate_fee_schedule",
            targetType: "fee_schedules",
            targetId: existing.id,
            before: existing,
            after: updated[0],
            ipAddress: getClientIp(context),
          });
        }
        return updated;
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Fee schedule not found");
    } catch {
      return internalError(context);
    }
  },
);
