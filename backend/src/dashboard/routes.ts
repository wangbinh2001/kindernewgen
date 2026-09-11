import { and, asc, count, desc, eq, gt, lt, ne, sum } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  attendance,
  classes,
  parentRequests,
  studentBalances,
  students,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { internalError, validationError } from "../http/errors";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function requestedDate(context: Context) {
  const value = context.req.query("date") ?? today();
  const parsed = dateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function activityTime(value: Date) {
  return value.getTime();
}

export const dashboardRoutes = new Hono();

dashboardRoutes.get(
  "/stats",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const date = requestedDate(context);
    if (!date) return validationError(context, "Invalid dashboard date");
    const schoolId = claimsOf(context).school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [studentCount] = await tx
          .select({ value: count() })
          .from(students)
          .where(
            and(eq(students.schoolId, schoolId), eq(students.status, "active")),
          );
        const [classCount] = await tx
          .select({ value: count() })
          .from(classes)
          .where(
            and(eq(classes.schoolId, schoolId), eq(classes.status, "active")),
          );
        const [presentCount] = await tx
          .select({ value: count() })
          .from(attendance)
          .where(
            and(
              eq(attendance.schoolId, schoolId),
              eq(attendance.date, date),
              eq(attendance.status, "present"),
              ne(attendance.state, "voided"),
            ),
          );
        const [uncollected] = await tx
          .select({ value: sum(studentBalances.closingAmount) })
          .from(studentBalances)
          .where(
            and(
              eq(studentBalances.schoolId, schoolId),
              gt(studentBalances.closingAmount, 0),
            ),
          );
        const [pending] = await tx
          .select({ value: count() })
          .from(parentRequests)
          .where(
            and(
              eq(parentRequests.schoolId, schoolId),
              eq(parentRequests.status, "pending"),
            ),
          );

        const totalStudents = Number(studentCount?.value ?? 0);
        const present = Number(presentCount?.value ?? 0);
        return {
          totalStudents,
          totalClasses: Number(classCount?.value ?? 0),
          todayAttendance: {
            total: totalStudents,
            present,
            percentage:
              totalStudents === 0
                ? 0
                : Math.round((present / totalStudents) * 10000) / 100,
          },
          uncollectedTuition: Number(uncollected?.value ?? 0),
          pendingRequests: Number(pending?.value ?? 0),
        };
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

dashboardRoutes.get(
  "/recent-activities",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = claimsOf(context).school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [studentRows, classRows, requestRows] = await Promise.all([
          tx
            .select({
              id: students.id,
              fullName: students.fullName,
              createdAt: students.createdAt,
            })
            .from(students)
            .where(eq(students.schoolId, schoolId))
            .orderBy(desc(students.createdAt), desc(students.id))
            .limit(10),
          tx
            .select({
              id: classes.id,
              name: classes.name,
              createdAt: classes.createdAt,
            })
            .from(classes)
            .where(eq(classes.schoolId, schoolId))
            .orderBy(desc(classes.createdAt), desc(classes.id))
            .limit(10),
          tx
            .select({
              id: parentRequests.id,
              requestType: parentRequests.type,
              content: parentRequests.content,
              createdAt: parentRequests.createdAt,
            })
            .from(parentRequests)
            .where(eq(parentRequests.schoolId, schoolId))
            .orderBy(desc(parentRequests.createdAt), desc(parentRequests.id))
            .limit(10),
        ]);
        return [
          ...studentRows.map((row) => ({
            type: "student_created" as const,
            id: row.id,
            fullName: row.fullName,
            createdAt: row.createdAt,
          })),
          ...classRows.map((row) => ({
            type: "class_created" as const,
            id: row.id,
            name: row.name,
            createdAt: row.createdAt,
          })),
          ...requestRows.map((row) => ({
            type: "parent_request_created" as const,
            id: row.id,
            requestType: row.requestType,
            content: row.content,
            createdAt: row.createdAt,
          })),
        ]
          .sort((left, right) => {
            const difference =
              activityTime(right.createdAt) - activityTime(left.createdAt);
            return difference || right.id.localeCompare(left.id);
          })
          .slice(0, 10);
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

dashboardRoutes.get(
  "/alerts",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const date = requestedDate(context);
    if (!date) return validationError(context, "Invalid dashboard date");
    const schoolId = claimsOf(context).school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const overdueBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [pendingRequestsOverdue, activeClasses, markedClasses] =
          await Promise.all([
            tx
              .select({
                id: parentRequests.id,
                parentId: parentRequests.parentId,
                childId: parentRequests.childId,
                type: parentRequests.type,
                content: parentRequests.content,
                urgent: parentRequests.urgent,
                status: parentRequests.status,
                createdAt: parentRequests.createdAt,
              })
              .from(parentRequests)
              .where(
                and(
                  eq(parentRequests.schoolId, schoolId),
                  eq(parentRequests.status, "pending"),
                  lt(parentRequests.createdAt, overdueBefore),
                ),
              )
              .orderBy(asc(parentRequests.createdAt), asc(parentRequests.id)),
            tx
              .select({
                id: classes.id,
                name: classes.name,
                teacherId: classes.teacherId,
                createdAt: classes.createdAt,
              })
              .from(classes)
              .where(
                and(
                  eq(classes.schoolId, schoolId),
                  eq(classes.status, "active"),
                ),
              )
              .orderBy(asc(classes.name), asc(classes.id)),
            tx
              .select({ classId: attendance.classId })
              .from(attendance)
              .where(
                and(
                  eq(attendance.schoolId, schoolId),
                  eq(attendance.date, date),
                  ne(attendance.state, "voided"),
                ),
              ),
          ]);
        const markedIds = new Set(markedClasses.map((row) => row.classId));
        return {
          pendingRequestsOverdue,
          unmarkedClasses: activeClasses
            .filter((row) => !markedIds.has(row.id))
            .map(({ id, name, teacherId, createdAt }) => ({
              id,
              name,
              teacherId,
              createdAt,
            })),
        };
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);
