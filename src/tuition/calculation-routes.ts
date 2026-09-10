import { and, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
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
  feeSchedules,
  optionalFees,
  studentBalances,
  studentReductions,
  students,
  tuitionHistory,
  tuitionItems,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const monthSchema = z.string().regex(/^\d{4}-\d{2}-01$/);
const calculateSchema = z
  .object({
    month: monthSchema,
    classId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
  })
  .strict();

const confirmItemSchema = z
  .object({
    feeType: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().int(),
  })
  .strict();
const confirmRecordSchema = z
  .object({
    studentId: z.string().min(1),
    studentName: z.string().optional(),
    classId: z.string().min(1),
    className: z.string().optional(),
    totalFees: z.number().int().min(0),
    totalReduction: z.number().int().min(0),
    finalAmount: z.number().int(),
    previousBalance: z.number().int().default(0),
    feeSnapshot: z.record(z.string(), z.unknown()),
    items: z.array(confirmItemSchema).min(1),
    reductionType: z.enum(["percentage", "fixed"]).nullable(),
    reductionValue: z.number().int().min(0).nullable(),
    note: z.string().optional(),
  })
  .strict();
const confirmSchema = z
  .object({ month: monthSchema, records: z.array(confirmRecordSchema).min(1) })
  .strict();

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

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

async function calculateStudent(
  tx: TenantTransaction,
  schoolId: string,
  month: string,
  student: { id: string; fullName: string },
  classId: string,
) {
  const [classRow] = await tx
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, schoolId)));
  if (!classRow) return null;

  const schedules = await tx
    .select()
    .from(feeSchedules)
    .where(
      and(
        eq(feeSchedules.schoolId, schoolId),
        eq(feeSchedules.status, "active"),
        or(isNull(feeSchedules.classId), eq(feeSchedules.classId, classId)),
      ),
    );
  const attendanceRows = await tx
    .select({ id: attendance.id })
    .from(attendance)
    .where(
      and(
        eq(attendance.schoolId, schoolId),
        eq(attendance.studentId, student.id),
        eq(attendance.classId, classId),
        gte(attendance.date, month),
        lt(attendance.date, shiftMonth(month, 1)),
        ne(attendance.state, "voided"),
      ),
    );
  const snapshots = attendanceRows.length
    ? await tx
        .select({
          optionalFeeId: attendanceOptionalFees.optionalFeeId,
          amount: attendanceOptionalFees.feeSnapshotAmount,
        })
        .from(attendanceOptionalFees)
        .where(
          and(
            eq(attendanceOptionalFees.schoolId, schoolId),
            inArray(
              attendanceOptionalFees.attendanceId,
              attendanceRows.map((row) => row.id),
            ),
          ),
        )
    : [];
  const snapshotItems = snapshots.map((row) => ({
    feeType: "optional",
    description: row.optionalFeeId,
    amount: row.amount,
  }));
  const items = [
    ...schedules.map((fee) => ({
      feeType: fee.type,
      description: fee.name,
      amount: fee.amount,
    })),
    ...snapshotItems,
  ];
  const totalFees = items.reduce((sum, item) => sum + item.amount, 0);
  const [reduction] = await tx
    .select()
    .from(studentReductions)
    .where(
      and(
        eq(studentReductions.schoolId, schoolId),
        eq(studentReductions.studentId, student.id),
        eq(studentReductions.status, "active"),
      ),
    );
  const totalReduction = reduction
    ? reduction.reductionType === "percentage"
      ? Math.floor((totalFees * reduction.reductionValue) / 100)
      : Math.min(totalFees, reduction.reductionValue)
    : 0;
  const [previous] = await tx
    .select({ closingAmount: studentBalances.closingAmount })
    .from(studentBalances)
    .where(
      and(
        eq(studentBalances.schoolId, schoolId),
        eq(studentBalances.studentId, student.id),
        eq(studentBalances.period, shiftMonth(month, -1)),
      ),
    );
  return {
    studentId: student.id,
    studentName: student.fullName,
    classId: classRow.id,
    className: classRow.name,
    totalFees,
    totalReduction,
    finalAmount: totalFees - totalReduction,
    previousBalance: previous?.closingAmount ?? 0,
    reductionType: reduction?.reductionType ?? null,
    reductionValue: reduction?.reductionValue ?? null,
    feeSnapshot: { fees: schedules, optionalFees: snapshots },
    items,
  };
}

async function lockBalance(
  tx: TenantTransaction,
  schoolId: string,
  studentId: string,
  month: string,
  openingAmount: number,
) {
  let [balance] = await tx
    .select()
    .from(studentBalances)
    .where(
      and(
        eq(studentBalances.schoolId, schoolId),
        eq(studentBalances.studentId, studentId),
        eq(studentBalances.period, month),
      ),
    )
    .for("update");
  if (!balance) {
    const [created] = await tx
      .insert(studentBalances)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        studentId,
        period: month,
        openingAmount,
        charges: 0,
        payments: 0,
        adjustments: 0,
        closingAmount: openingAmount,
      })
      .onConflictDoNothing()
      .returning();
    balance = created;
    if (!balance) {
      [balance] = await tx
        .select()
        .from(studentBalances)
        .where(
          and(
            eq(studentBalances.schoolId, schoolId),
            eq(studentBalances.studentId, studentId),
            eq(studentBalances.period, month),
          ),
        )
        .for("update");
    }
  }
  if (!balance) throw new Error("Balance was not created");
  return balance;
}

export const calculationRoutes = new Hono();

calculationRoutes.post(
  "/calculate",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = calculateSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid calculation request");
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        let roster = await tx
          .select({
            id: students.id,
            fullName: students.fullName,
            classId: classStudents.classId,
          })
          .from(classStudents)
          .innerJoin(students, eq(students.id, classStudents.studentId))
          .where(
            and(
              eq(classStudents.schoolId, schoolId),
              eq(students.schoolId, schoolId),
              isNull(classStudents.leftAt),
              parsed.data.classId
                ? eq(classStudents.classId, parsed.data.classId)
                : undefined,
              parsed.data.studentId
                ? eq(classStudents.studentId, parsed.data.studentId)
                : undefined,
            ),
          );
        if (parsed.data.studentId && !roster.length)
          return "not_found" as const;
        const unique = new Map(roster.map((row) => [row.id, row]));
        roster = [...unique.values()];
        const results = [];
        for (const row of roster) {
          const calculated = await calculateStudent(
            tx,
            schoolId,
            parsed.data.month,
            row,
            row.classId,
          );
          if (calculated) results.push(calculated);
        }
        return results;
      });
      return data === "not_found"
        ? notFoundError(context, "Student not found")
        : context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

calculationRoutes.post(
  "/confirm",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = confirmSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid tuition records");
    const schoolId = schoolIdOf(context);
    const claims = claimsOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const prepared = [];
        for (const record of parsed.data.records) {
          const [student] = await tx
            .select({ id: students.id })
            .from(students)
            .where(
              and(
                eq(students.id, record.studentId),
                eq(students.schoolId, schoolId),
              ),
            );
          if (!student) return { kind: "not_found" as const };
          const [existing] = await tx
            .select({ state: tuitionHistory.state })
            .from(tuitionHistory)
            .where(
              and(
                eq(tuitionHistory.schoolId, schoolId),
                eq(tuitionHistory.studentId, record.studentId),
                eq(tuitionHistory.month, parsed.data.month),
              ),
            );
          if (existing?.state === "confirmed")
            return { kind: "confirmed" as const };
          const [classRow] = await tx
            .select({ id: classStudents.classId })
            .from(classStudents)
            .where(
              and(
                eq(classStudents.schoolId, schoolId),
                eq(classStudents.studentId, record.studentId),
                eq(classStudents.classId, record.classId),
                isNull(classStudents.leftAt),
              ),
            );
          if (!classRow) return { kind: "invalid_class" as const };
          if (record.finalAmount !== record.totalFees - record.totalReduction) {
            return { kind: "invalid_amount" as const };
          }
          const [previous] = await tx
            .select({ closingAmount: studentBalances.closingAmount })
            .from(studentBalances)
            .where(
              and(
                eq(studentBalances.schoolId, schoolId),
                eq(studentBalances.studentId, record.studentId),
                eq(studentBalances.period, shiftMonth(parsed.data.month, -1)),
              ),
            );
          prepared.push({
            record,
            opening: previous?.closingAmount ?? 0,
          });
        }
        const saved = [];
        for (const { record, opening } of prepared) {
          const now = new Date();
          const balance = await lockBalance(
            tx,
            schoolId,
            record.studentId,
            parsed.data.month,
            opening,
          );
          const [history] = await tx
            .insert(tuitionHistory)
            .values({
              id: crypto.randomUUID(),
              schoolId,
              studentId: record.studentId,
              month: parsed.data.month,
              feeSnapshot: record.feeSnapshot,
              reductionType: record.reductionType,
              reductionValue: record.reductionValue,
              totalFees: record.totalFees,
              totalReduction: record.totalReduction,
              finalAmount: record.finalAmount,
              note: record.note,
              state: "confirmed",
              confirmedAt: now,
              confirmedBy: claims.membership_id,
            })
            .returning();
          if (!history) throw new Error("Tuition history was not saved");
          await tx.insert(tuitionItems).values(
            record.items.map((item) => ({
              id: crypto.randomUUID(),
              tuitionHistoryId: history.id,
              ...item,
            })),
          );
          const closingAmount =
            balance.openingAmount +
            record.finalAmount -
            balance.payments +
            balance.adjustments;
          await tx
            .update(studentBalances)
            .set({
              openingAmount: opening,
              charges: record.finalAmount,
              closingAmount,
            })
            .where(eq(studentBalances.id, balance.id));
          saved.push(history);
        }
        return { kind: "saved" as const, data: saved };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Student not found");
      if (result.kind === "confirmed")
        return validationError(context, "Tuition is already confirmed");
      if (result.kind === "invalid_class")
        return validationError(
          context,
          "Student is not enrolled in this class",
        );
      if (result.kind === "invalid_amount")
        return validationError(
          context,
          "Tuition amount does not match its reduction",
        );
      return context.json(
        { success: true, data: result.data, error: null },
        201,
      );
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Tuition is already confirmed")
        : internalError(context);
    }
  },
);
