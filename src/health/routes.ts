import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  classStudents,
  classes,
  healthRecords,
  schoolMemberships,
  students,
  teacherAssignments,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { internalError, notFoundError, validationError } from "../http/errors";

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

const createSchema = z
  .object({
    studentId: z.string().min(1),
    date: dateSchema,
    height: z.coerce.number().positive(),
    weight: z.coerce.number().positive(),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

const voidSchema = z.object({ reason: z.string().trim().min(1) }).strict();

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

function schoolIdOf(context: Context) {
  return claimsOf(context).school_id;
}

function forbidden(context: Context, message: string) {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message },
    },
    403,
  );
}

function ageInMonths(dob: string, date: string) {
  const birth = new Date(`${dob}T00:00:00Z`);
  const measured = new Date(`${date}T00:00:00Z`);
  let months =
    (measured.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    measured.getUTCMonth() -
    birth.getUTCMonth();
  if (measured.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function bmiOf(height: number, weight: number) {
  return Math.round((weight / Math.pow(height / 100, 2)) * 100) / 100;
}

function responseRecord(record: typeof healthRecords.$inferSelect) {
  return {
    ...record,
    height: Number(record.height),
    weight: Number(record.weight),
    bmi: Number(record.bmi),
  };
}

export const healthRoutes = new Hono();

healthRoutes.post(
  "/health",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = createSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid health record");

    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [student] = await tx
          .select({ id: students.id, dob: students.dob })
          .from(students)
          .where(
            and(
              eq(students.id, parsed.data.studentId),
              eq(students.schoolId, schoolId),
            ),
          );
        if (!student) return { kind: "not_found" as const };
        if (!student.dob) return { kind: "missing_dob" as const };

        const [membership] = await tx
          .select({ id: schoolMemberships.id })
          .from(schoolMemberships)
          .where(
            and(
              eq(schoolMemberships.id, claims.membership_id),
              eq(schoolMemberships.schoolId, schoolId),
              eq(schoolMemberships.status, "active"),
            ),
          );
        if (!membership) return { kind: "invalid_membership" as const };

        const [record] = await tx
          .insert(healthRecords)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            studentId: student.id,
            date: parsed.data.date,
            height: parsed.data.height.toFixed(2),
            weight: parsed.data.weight.toFixed(2),
            bmi: bmiOf(parsed.data.height, parsed.data.weight).toFixed(2),
            whoStandardVersion: "WHO_2006",
            ageMonths: ageInMonths(student.dob, parsed.data.date),
            classification: null,
            note: parsed.data.note,
            createdBy: membership.id,
            state: "active",
          })
          .returning();
        return record
          ? { kind: "created" as const, record }
          : { kind: "error" as const };
      });
      if (result.kind === "not_found") {
        return notFoundError(context, "Student not found");
      }
      if (result.kind === "missing_dob") {
        return validationError(context, "Student date of birth is required");
      }
      if (result.kind === "invalid_membership") {
        return validationError(context, "Invalid school membership");
      }
      if (result.kind === "error") return internalError(context);
      return context.json(
        { success: true, data: responseRecord(result.record), error: null },
        201,
      );
    } catch {
      return internalError(context);
    }
  },
);

healthRoutes.get(
  "/health",
  requireAuth,
  requireRole("school_admin", "staff", "teacher"),
  async (context) => {
    const classId = context.req.query("classId");
    if (!classId) return validationError(context, "classId is required");
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [classRow] = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.id, classId), eq(classes.schoolId, schoolId)))
          .limit(1);
        if (!classRow) return { kind: "not_found" as const };

        if (claims.role === "teacher") {
          const [assignment] = await tx
            .select({ id: teacherAssignments.id })
            .from(teacherAssignments)
            .where(
              and(
                eq(teacherAssignments.schoolId, schoolId),
                eq(teacherAssignments.teacherId, claims.sub),
                eq(teacherAssignments.classId, classId),
                eq(teacherAssignments.status, "active"),
              ),
            );
          if (!assignment) return { kind: "forbidden" as const };
        }

        const roster = await tx
          .select({
            studentId: students.id,
            fullName: students.fullName,
          })
          .from(classStudents)
          .innerJoin(students, eq(students.id, classStudents.studentId))
          .where(
            and(
              eq(classStudents.schoolId, schoolId),
              eq(classStudents.classId, classId),
              isNull(classStudents.leftAt),
            ),
          )
          .orderBy(asc(students.fullName), asc(students.id));
        const ids = roster.map((row) => row.studentId);
        const records = ids.length
          ? await tx
              .select()
              .from(healthRecords)
              .where(
                and(
                  eq(healthRecords.schoolId, schoolId),
                  eq(healthRecords.state, "active"),
                  inArray(healthRecords.studentId, ids),
                ),
              )
              .orderBy(desc(healthRecords.date), desc(healthRecords.createdAt))
          : [];
        return {
          kind: "ok" as const,
          data: roster.map((student) => ({
            student,
            health: (() => {
              const record = records.find(
                (item) => item.studentId === student.studentId,
              );
              return record ? responseRecord(record) : null;
            })(),
          })),
        };
      });
      if (result.kind === "not_found") {
        return notFoundError(context, "Class not found");
      }
      if (result.kind === "forbidden") {
        return forbidden(context, "Class is not assigned");
      }
      return context.json({ success: true, data: result.data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

healthRoutes.get(
  "/students/:studentId/health-history",
  requireAuth,
  requireRole("school_admin", "staff", "teacher"),
  async (context) => {
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
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
        if (claims.role === "teacher") {
          const [assignment] = await tx
            .select({ id: teacherAssignments.id })
            .from(classStudents)
            .innerJoin(
              teacherAssignments,
              and(
                eq(teacherAssignments.classId, classStudents.classId),
                eq(teacherAssignments.schoolId, schoolId),
              ),
            )
            .where(
              and(
                eq(classStudents.schoolId, schoolId),
                eq(classStudents.studentId, studentId),
                isNull(classStudents.leftAt),
                eq(teacherAssignments.teacherId, claims.sub),
                eq(teacherAssignments.status, "active"),
              ),
            );
          if (!assignment) return { kind: "forbidden" as const };
        }
        const records = await tx
          .select()
          .from(healthRecords)
          .where(
            and(
              eq(healthRecords.schoolId, schoolId),
              eq(healthRecords.studentId, studentId),
              eq(healthRecords.state, "active"),
            ),
          )
          .orderBy(desc(healthRecords.date), desc(healthRecords.createdAt));
        return { kind: "ok" as const, records };
      });
      if (result.kind === "not_found") {
        return notFoundError(context, "Student not found");
      }
      if (result.kind === "forbidden") {
        return forbidden(context, "Student is not in an assigned class");
      }
      return context.json({
        success: true,
        data: result.records.map(responseRecord),
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

healthRoutes.post(
  "/health/:id/void",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = voidSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid void reason");
    const schoolId = schoolIdOf(context);
    try {
      const [record] = await withTenant(schoolId, (tx) =>
        tx
          .update(healthRecords)
          .set({ state: "voided", voidedReason: parsed.data.reason })
          .where(
            and(
              eq(healthRecords.id, context.req.param("id")!),
              eq(healthRecords.schoolId, schoolId),
              eq(healthRecords.state, "active"),
            ),
          )
          .returning(),
      );
      return record
        ? context.json({
            success: true,
            data: responseRecord(record),
            error: null,
          })
        : notFoundError(context, "Health record not found");
    } catch {
      return internalError(context);
    }
  },
);
