import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { studentReductions, students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { getClientIp, recordAuditLog } from "../db/audit";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const reductionSchema = z
  .object({
    reductionType: z.enum(["percentage", "fixed"]),
    reductionValue: z.number().int().min(0),
    status: z.enum(["active", "inactive"]).optional(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reductionType === "percentage" && value.reductionValue > 100) {
      context.addIssue({
        code: "custom",
        path: ["reductionValue"],
        message: "Percentage cannot exceed 100",
      });
    }
  });

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

export const studentReductionRoutes = new Hono();

studentReductionRoutes.get(
  "/:studentId/reduction",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = schoolIdOf(context);
    const studentId = context.req.param("studentId")!;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(
            and(eq(students.id, studentId), eq(students.schoolId, schoolId)),
          );
        if (!student) return "not_found" as const;
        const [reduction] = await tx
          .select()
          .from(studentReductions)
          .where(
            and(
              eq(studentReductions.studentId, studentId),
              eq(studentReductions.schoolId, schoolId),
            ),
          );
        return reduction ?? null;
      });
      return data === "not_found"
        ? notFoundError(context, "Student not found")
        : context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

studentReductionRoutes.put(
  "/:studentId/reduction",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = reductionSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid student reduction");
    const schoolId = schoolIdOf(context);
    const studentId = context.req.param("studentId")!;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(
            and(eq(students.id, studentId), eq(students.schoolId, schoolId)),
          );
        if (!student) return { kind: "not_found" as const };
        const [existing] = await tx
          .select({ id: studentReductions.id })
          .from(studentReductions)
          .where(
            and(
              eq(studentReductions.studentId, studentId),
              eq(studentReductions.schoolId, schoolId),
            ),
          );
        const data = existing
          ? (
              await tx
                .update(studentReductions)
                .set(parsed.data)
                .where(eq(studentReductions.id, existing.id))
                .returning()
            )[0]
          : (
              await tx
                .insert(studentReductions)
                .values({
                  id: crypto.randomUUID(),
                  schoolId,
                  studentId,
                  ...parsed.data,
                  status: parsed.data.status ?? "active",
                })
                .returning()
            )[0];

        if (data) {
          await recordAuditLog(tx, {
            actorId: (context.get("auth").claims as TenantAccessTokenClaims).sub,
            schoolId,
            action: existing ? "update_student_reduction" : "create_student_reduction",
            targetType: "student_reductions",
            targetId: data.id,
            before: existing ?? undefined,
            after: data,
            ipAddress: getClientIp(context),
          });
        }

        return { kind: "saved" as const, data };
      });
      return result.kind === "not_found"
        ? notFoundError(context, "Student not found")
        : context.json({ success: true, data: result.data, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Student reduction already exists")
        : internalError(context);
    }
  },
);
