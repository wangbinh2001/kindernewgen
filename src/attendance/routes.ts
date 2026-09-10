import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  attendance,
  attendanceOptionalFees,
  classStudents,
  classes,
  optionalFees,
  students,
  teacherAssignments,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statusSchema = z.enum(["present", "absent", "late", "excused"]);
const stateSchema = z.enum(["draft", "confirmed"]);
const recordSchema = z
  .object({
    studentId: z.string().min(1),
    classId: z.string().min(1),
    date: dateSchema,
    status: statusSchema,
    note: z.string().optional(),
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
    overtimeStart: z.string().optional(),
    overtimeEnd: z.string().optional(),
    overtimeHours: z.coerce.number().min(0).optional(),
    state: stateSchema.default("draft"),
    optionalFeeIds: z.array(z.string().min(1)).default([]),
    voidedReason: z.string().trim().min(1).optional(),
  })
  .strict();
const bulkSchema = z.object({ records: z.array(recordSchema).min(1) }).strict();

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

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

function isTeacher(claims: TenantAccessTokenClaims) {
  return claims.role === "teacher";
}

async function validateScope(
  tx: TenantTransaction,
  schoolId: string,
  claims: TenantAccessTokenClaims,
  studentId: string,
  classId: string,
  optionalFeeIds: string[],
) {
  const [classRow] = await tx
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.id, classId),
        eq(classes.schoolId, schoolId),
        eq(classes.status, "active"),
      ),
    );
  if (!classRow) return { kind: "invalid" as const };

  if (isTeacher(claims)) {
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

  const [enrollment] = await tx
    .select({ id: classStudents.id })
    .from(classStudents)
    .where(
      and(
        eq(classStudents.schoolId, schoolId),
        eq(classStudents.classId, classId),
        eq(classStudents.studentId, studentId),
        isNull(classStudents.leftAt),
      ),
    );
  if (!enrollment) return { kind: "invalid" as const };

  const fees = optionalFeeIds.length
    ? await tx
        .select({ id: optionalFees.id, amount: optionalFees.amount })
        .from(optionalFees)
        .where(
          and(
            eq(optionalFees.schoolId, schoolId),
            eq(optionalFees.status, "active"),
            inArray(optionalFees.id, optionalFeeIds),
          ),
        )
    : [];
  if (fees.length !== new Set(optionalFeeIds).size) {
    return { kind: "invalid_fee" as const };
  }
  return { kind: "ok" as const, classRow, fees };
}

function attendanceValues(
  record: z.infer<typeof recordSchema>,
  schoolId: string,
  updatedBy: string,
) {
  return {
    schoolId,
    studentId: record.studentId,
    classId: record.classId,
    date: record.date,
    status: record.status,
    note: record.note,
    checkInTime: record.checkInTime,
    checkOutTime: record.checkOutTime,
    overtimeStart: record.overtimeStart,
    overtimeEnd: record.overtimeEnd,
    overtimeHours:
      record.overtimeHours === undefined
        ? null
        : record.overtimeHours.toFixed(2),
    state: record.state,
    updatedAt: new Date(),
    updatedBy,
  };
}

async function replaceFeeSnapshots(
  tx: TenantTransaction,
  schoolId: string,
  attendanceId: string,
  fees: Array<{ id: string; amount: number }>,
) {
  await tx
    .delete(attendanceOptionalFees)
    .where(eq(attendanceOptionalFees.attendanceId, attendanceId));
  if (fees.length) {
    await tx.insert(attendanceOptionalFees).values(
      fees.map((fee) => ({
        id: crypto.randomUUID(),
        schoolId,
        attendanceId,
        optionalFeeId: fee.id,
        feeSnapshotAmount: fee.amount,
      })),
    );
  }
}

export const attendanceRoutes = new Hono();

attendanceRoutes.get(
  "/",
  requireAuth,
  requireRole("school_admin", "staff", "teacher"),
  async (context) => {
    const date = context.req.query("date");
    const classId = context.req.query("classId");
    const parsedDate = dateSchema.safeParse(date);
    if (!parsedDate.success || !classId) {
      return validationError(context, "date and classId are required");
    }
    const schoolId = schoolIdOf(context);
    const claims = claimsOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const scope = await validateScope(
          tx,
          schoolId,
          claims,
          "__roster__",
          classId,
          [],
        );
        if (scope.kind === "forbidden") return "forbidden" as const;
        if (scope.kind === "invalid") {
          const [classRow] = await tx
            .select({ id: classes.id })
            .from(classes)
            .where(
              and(eq(classes.id, classId), eq(classes.schoolId, schoolId)),
            );
          if (!classRow) return "missing" as const;
        }
        const roster = await tx
          .select({ id: students.id, fullName: students.fullName })
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
        const records = await tx
          .select()
          .from(attendance)
          .where(
            and(
              eq(attendance.schoolId, schoolId),
              eq(attendance.classId, classId),
              eq(attendance.date, parsedDate.data),
              ne(attendance.state, "voided"),
            ),
          );
        const ids = records.map((row) => row.id);
        const fees = ids.length
          ? await tx
              .select()
              .from(attendanceOptionalFees)
              .where(
                and(
                  eq(attendanceOptionalFees.schoolId, schoolId),
                  inArray(attendanceOptionalFees.attendanceId, ids),
                ),
              )
          : [];
        return roster.map((student) => ({
          student,
          attendance:
            records.find((row) => row.studentId === student.id) ?? null,
          optionalFees: fees.filter(
            (fee) =>
              records.find((row) => row.studentId === student.id)?.id ===
              fee.attendanceId,
          ),
        }));
      });
      if (data === "forbidden") {
        return context.json(
          {
            success: false,
            data: null,
            error: { code: "FORBIDDEN", message: "Class is not assigned" },
          },
          403,
        );
      }
      if (data === "missing") return notFoundError(context, "Class not found");
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

attendanceRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin", "teacher"),
  async (context) => {
    const parsed = bulkSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid attendance records");
    const schoolId = schoolIdOf(context);
    const claims = claimsOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const prepared = [];
        for (const record of parsed.data.records) {
          const scope = await validateScope(
            tx,
            schoolId,
            claims,
            record.studentId,
            record.classId,
            record.optionalFeeIds,
          );
          if (scope.kind !== "ok") return scope;
          const [existing] = await tx
            .select()
            .from(attendance)
            .where(
              and(
                eq(attendance.schoolId, schoolId),
                eq(attendance.studentId, record.studentId),
                eq(attendance.date, record.date),
                ne(attendance.state, "voided"),
              ),
            );
          if (existing?.state === "confirmed")
            return { kind: "confirmed" as const };
          prepared.push({ record, scope, existing });
        }

        const saved = [];
        for (const { record, scope, existing } of prepared) {
          const values = attendanceValues(record, schoolId, claims.sub);
          const row = existing
            ? (
                await tx
                  .update(attendance)
                  .set(values)
                  .where(eq(attendance.id, existing.id))
                  .returning()
              )[0]
            : (
                await tx
                  .insert(attendance)
                  .values({ id: crypto.randomUUID(), ...values })
                  .returning()
              )[0];
          if (!row) throw new Error("Attendance was not saved");
          await replaceFeeSnapshots(tx, schoolId, row.id, scope.fees);
          saved.push(row);
        }
        return { kind: "saved" as const, data: saved };
      });
      if (result.kind === "forbidden") {
        return context.json(
          {
            success: false,
            data: null,
            error: { code: "FORBIDDEN", message: "Class is not assigned" },
          },
          403,
        );
      }
      if (result.kind === "confirmed") {
        return validationError(
          context,
          "Confirmed attendance cannot be overwritten",
        );
      }
      if (result.kind === "invalid_fee") {
        return validationError(context, "Optional fee is missing or inactive");
      }
      if (result.kind === "invalid") {
        return validationError(
          context,
          "Student is not enrolled in this class",
        );
      }
      return context.json({ success: true, data: result.data, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Attendance already exists")
        : internalError(context);
    }
  },
);

attendanceRoutes.post(
  "/:id/adjust",
  requireAuth,
  requireRole("school_admin", "teacher"),
  async (context) => {
    const parsed = recordSchema.safeParse(await readJson(context));
    if (!parsed.success || parsed.data.state !== "confirmed") {
      return validationError(context, "A confirmed correction is required");
    }
    const schoolId = schoolIdOf(context);
    const claims = claimsOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [old] = await tx
          .select()
          .from(attendance)
          .where(
            and(
              eq(attendance.id, context.req.param("id")!),
              eq(attendance.schoolId, schoolId),
            ),
          );
        if (!old) return { kind: "not_found" as const };
        if (old.state !== "confirmed")
          return { kind: "not_confirmed" as const };
        if (
          old.studentId !== parsed.data.studentId ||
          old.classId !== parsed.data.classId ||
          old.date !== parsed.data.date
        ) {
          return { kind: "identity_mismatch" as const };
        }
        const scope = await validateScope(
          tx,
          schoolId,
          claims,
          parsed.data.studentId,
          parsed.data.classId,
          parsed.data.optionalFeeIds,
        );
        if (scope.kind !== "ok") return scope;
        const now = new Date();
        await tx
          .update(attendance)
          .set({
            state: "voided",
            voidedReason: parsed.data.voidedReason ?? "Attendance adjusted",
            updatedAt: now,
            updatedBy: claims.sub,
          })
          .where(eq(attendance.id, old.id));
        const values = attendanceValues(parsed.data, schoolId, claims.sub);
        const [correction] = await tx
          .insert(attendance)
          .values({
            id: crypto.randomUUID(),
            ...values,
            state: "confirmed",
            createdAt: now,
          })
          .returning();
        if (!correction) throw new Error("Attendance correction was not saved");
        await replaceFeeSnapshots(tx, schoolId, correction.id, scope.fees);
        return { kind: "adjusted" as const, data: correction };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Attendance not found");
      if (result.kind === "not_confirmed")
        return validationError(
          context,
          "Only confirmed attendance can be adjusted",
        );
      if (result.kind === "identity_mismatch")
        return validationError(context, "Attendance identity cannot change");
      if (result.kind === "forbidden") {
        return context.json(
          {
            success: false,
            data: null,
            error: { code: "FORBIDDEN", message: "Class is not assigned" },
          },
          403,
        );
      }
      if (result.kind === "invalid_fee")
        return validationError(context, "Optional fee is missing or inactive");
      if (result.kind === "invalid")
        return validationError(
          context,
          "Student is not enrolled in this class",
        );
      return context.json({ success: true, data: result.data, error: null });
    } catch {
      return internalError(context);
    }
  },
);
