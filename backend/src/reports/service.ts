import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  attendance,
  grocerySheets,
  menus,
  operatingCosts,
  payments,
  reportJobs,
  studentBalances,
  students,
  tuitionHistory,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";

export type ReportType = "tuition" | "attendance" | "nutrition";

export interface ReportParameters {
  startDate?: string;
  endDate?: string;
  month?: string;
  classId?: string;
  [key: string]: unknown;
}

export async function generateTuitionReport(
  tx: TenantTransaction,
  schoolId: string,
  params: ReportParameters = {},
) {
  // 1. Tổng hợp lịch sử học phí
  const tuitionConditions = [eq(tuitionHistory.schoolId, schoolId)];
  if (params.month) {
    tuitionConditions.push(eq(tuitionHistory.month, params.month));
  }

  const histories = await tx
    .select({
      id: tuitionHistory.id,
      studentId: tuitionHistory.studentId,
      studentName: students.fullName,
      month: tuitionHistory.month,
      totalFees: tuitionHistory.totalFees,
      totalReduction: tuitionHistory.totalReduction,
      finalAmount: tuitionHistory.finalAmount,
      state: tuitionHistory.state,
    })
    .from(tuitionHistory)
    .innerJoin(students, eq(students.id, tuitionHistory.studentId))
    .where(and(...tuitionConditions));

  // 2. Tổng hợp thanh toán
  const paymentRows = await tx
    .select({
      amount: payments.amount,
      method: payments.method,
    })
    .from(payments)
    .where(eq(payments.schoolId, schoolId));

  const totalFees = histories.reduce((sum, h) => sum + h.totalFees, 0);
  const totalReduction = histories.reduce((sum, h) => sum + h.totalReduction, 0);
  const totalFinalAmount = histories.reduce((sum, h) => sum + h.finalAmount, 0);
  const totalCollected = paymentRows.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, totalFinalAmount - totalCollected);

  return {
    summary: {
      totalRecords: histories.length,
      totalFees,
      totalReduction,
      totalFinalAmount,
      totalCollected,
      outstanding,
    },
    histories,
  };
}

export async function generateAttendanceReport(
  tx: TenantTransaction,
  schoolId: string,
  params: ReportParameters = {},
) {
  const conditions = [eq(attendance.schoolId, schoolId)];
  if (params.startDate) {
    conditions.push(gte(attendance.date, params.startDate));
  }
  if (params.endDate) {
    conditions.push(lte(attendance.date, params.endDate));
  }
  if (params.classId) {
    conditions.push(eq(attendance.classId, params.classId));
  }

  const records = await tx
    .select({
      id: attendance.id,
      studentId: attendance.studentId,
      studentName: students.fullName,
      classId: attendance.classId,
      date: attendance.date,
      status: attendance.status,
      overtimeHours: attendance.overtimeHours,
    })
    .from(attendance)
    .innerJoin(students, eq(students.id, attendance.studentId))
    .where(and(...conditions));

  let presentCount = 0;
  let excusedCount = 0;
  let unexcusedCount = 0;
  let totalOvertimeHours = 0;

  for (const r of records) {
    if (r.status === "present") presentCount++;
    else if (r.status === "excused") excusedCount++;
    else if (r.status === "unexcused") unexcusedCount++;

    if (r.overtimeHours) {
      totalOvertimeHours += Number(r.overtimeHours) || 0;
    }
  }

  const totalRecords = records.length;
  const attendanceRate =
    totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(1) + "%" : "0%";

  return {
    summary: {
      totalRecords,
      presentCount,
      excusedCount,
      unexcusedCount,
      attendanceRate,
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
    },
    records,
  };
}

export async function generateNutritionReport(
  tx: TenantTransaction,
  schoolId: string,
  params: ReportParameters = {},
) {
  const sheetConditions = [eq(grocerySheets.schoolId, schoolId)];
  if (params.startDate) {
    sheetConditions.push(gte(grocerySheets.startDate, params.startDate));
  }
  if (params.endDate) {
    sheetConditions.push(lte(grocerySheets.endDate, params.endDate));
  }

  const sheets = await tx
    .select()
    .from(grocerySheets)
    .where(and(...sheetConditions));

  const totalFoodCost = sheets.reduce((sum, s) => sum + Number(s.totalFoodCost || 0), 0);
  const estimatedTotal = sheets.reduce((sum, s) => sum + Number(s.estimatedTotal || 0), 0);
  const actualTotal = sheets.reduce(
    (sum, s) => sum + Number(s.actualTotal || s.estimatedTotal || 0),
    0,
  );

  const menuCount = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(menus)
    .where(eq(menus.schoolId, schoolId));

  const opCosts = await tx
    .select()
    .from(operatingCosts)
    .where(eq(operatingCosts.schoolId, schoolId));

  const totalOperatingCosts = opCosts.reduce(
    (sum, op) =>
      sum + Number(op.electricityCost || 0) + Number(op.gasCost || 0),
    0,
  );

  return {
    summary: {
      totalGrocerySheets: sheets.length,
      totalFoodCost,
      estimatedTotal,
      actualTotal,
      menuCount: menuCount[0]?.count ?? 0,
      totalOperatingCosts,
    },
    sheets,
  };
}

export async function processReportJob(jobId: string, schoolId: string) {
  try {
    const job = await withTenant(schoolId, async (tx) => {
      const [row] = await tx
        .select()
        .from(reportJobs)
        .where(and(eq(reportJobs.id, jobId), eq(reportJobs.schoolId, schoolId)));
      return row;
    });

    if (!job) return;

    await withTenant(schoolId, async (tx) => {
      await tx
        .update(reportJobs)
        .set({ status: "processing" })
        .where(and(eq(reportJobs.id, jobId), eq(reportJobs.schoolId, schoolId)));
    });

    const params = (job.parameters as ReportParameters) || {};

    const result = await withTenant(schoolId, async (tx) => {
      if (job.type === "tuition") {
        return await generateTuitionReport(tx, schoolId, params);
      } else if (job.type === "attendance") {
        return await generateAttendanceReport(tx, schoolId, params);
      } else if (job.type === "nutrition") {
        return await generateNutritionReport(tx, schoolId, params);
      } else {
        throw new Error(`Unsupported report type: ${job.type}`);
      }
    });

    await withTenant(schoolId, async (tx) => {
      await tx
        .update(reportJobs)
        .set({
          status: "completed",
          result,
          completedAt: new Date(),
        })
        .where(and(eq(reportJobs.id, jobId), eq(reportJobs.schoolId, schoolId)));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await withTenant(schoolId, async (tx) => {
      await tx
        .update(reportJobs)
        .set({
          status: "failed",
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(and(eq(reportJobs.id, jobId), eq(reportJobs.schoolId, schoolId)));
    });
  }
}

export function dispatchReportJob(jobId: string, schoolId: string) {
  // ponytail: in-process async dispatch, upgrade to Redis/BullMQ when multi-instance horizontal scale needed
  setTimeout(() => {
    processReportJob(jobId, schoolId).catch(console.error);
  }, 0);
}
