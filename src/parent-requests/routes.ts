import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  classStudents,
  parentRequestAttachments,
  parentRequestHistory,
  parentRequests,
  schoolMemberships,
  students,
  teacherAssignments,
  users,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import { internalError, notFoundError, validationError } from "../http/errors";

const resolutionSchema = z
  .object({
    response: z.string().trim().min(1),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

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

function forbidden(context: Context) {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message: "Request is outside teacher scope" },
    },
    403,
  );
}

async function allowedForTeacher(
  tx: TenantTransaction,
  schoolId: string,
  teacherId: string,
  childId: string,
) {
  const [row] = await tx
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
        eq(classStudents.studentId, childId),
        eq(teacherAssignments.teacherId, teacherId),
        eq(teacherAssignments.status, "active"),
      ),
    );
  return Boolean(row);
}

async function readRequest(
  tx: TenantTransaction,
  schoolId: string,
  requestId: string,
) {
  const [request] = await tx
    .select({
      id: parentRequests.id,
      schoolId: parentRequests.schoolId,
      parentId: parentRequests.parentId,
      parentName: users.displayName,
      childId: parentRequests.childId,
      childName: students.fullName,
      type: parentRequests.type,
      content: parentRequests.content,
      urgent: parentRequests.urgent,
      status: parentRequests.status,
      resolvedBy: parentRequests.resolvedBy,
      resolvedAt: parentRequests.resolvedAt,
      response: parentRequests.response,
      note: parentRequests.note,
      createdAt: parentRequests.createdAt,
      updatedAt: parentRequests.updatedAt,
    })
    .from(parentRequests)
    .innerJoin(students, eq(students.id, parentRequests.childId))
    .innerJoin(users, eq(users.id, parentRequests.parentId))
    .where(
      and(
        eq(parentRequests.id, requestId),
        eq(parentRequests.schoolId, schoolId),
      ),
    );
  if (!request) return null;
  const attachments = await tx
    .select()
    .from(parentRequestAttachments)
    .where(
      and(
        eq(parentRequestAttachments.schoolId, schoolId),
        eq(parentRequestAttachments.requestId, requestId),
      ),
    )
    .orderBy(asc(parentRequestAttachments.createdAt));
  const history = await tx
    .select({
      id: parentRequestHistory.id,
      status: parentRequestHistory.status,
      changedBy: parentRequestHistory.changedBy,
      changedByName: users.displayName,
      note: parentRequestHistory.note,
      createdAt: parentRequestHistory.createdAt,
    })
    .from(parentRequestHistory)
    .innerJoin(users, eq(users.id, parentRequestHistory.changedBy))
    .where(
      and(
        eq(parentRequestHistory.schoolId, schoolId),
        eq(parentRequestHistory.requestId, requestId),
      ),
    )
    .orderBy(asc(parentRequestHistory.createdAt), asc(parentRequestHistory.id));
  return { ...request, attachments, history };
}

export const parentRequestRoutes = new Hono();
const roles = ["school_admin", "teacher"] as const;

parentRequestRoutes.get(
  "/",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const rows = await tx
          .select({
            id: parentRequests.id,
            parentId: parentRequests.parentId,
            parentName: users.displayName,
            childId: parentRequests.childId,
            childName: students.fullName,
            type: parentRequests.type,
            content: parentRequests.content,
            urgent: parentRequests.urgent,
            status: parentRequests.status,
            response: parentRequests.response,
            createdAt: parentRequests.createdAt,
            updatedAt: parentRequests.updatedAt,
          })
          .from(parentRequests)
          .innerJoin(students, eq(students.id, parentRequests.childId))
          .innerJoin(users, eq(users.id, parentRequests.parentId))
          .where(eq(parentRequests.schoolId, schoolId))
          .orderBy(desc(parentRequests.createdAt), desc(parentRequests.id));
        if (claims.role === "school_admin") return rows;
        const childIds = await tx
          .select({ childId: classStudents.studentId })
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
              eq(teacherAssignments.teacherId, claims.sub),
              eq(teacherAssignments.status, "active"),
            ),
          );
        const allowed = new Set(childIds.map((row) => row.childId));
        return rows.filter((row) => allowed.has(row.childId));
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

parentRequestRoutes.get(
  "/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const request = await readRequest(
          tx,
          schoolId,
          context.req.param("id")!,
        );
        if (!request) return { kind: "not_found" as const };
        if (
          claims.role === "teacher" &&
          !(await allowedForTeacher(tx, schoolId, claims.sub, request.childId))
        ) {
          return { kind: "forbidden" as const };
        }
        return { kind: "ok" as const, request };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Parent request not found");
      if (result.kind === "forbidden") return forbidden(context);
      return context.json({ success: true, data: result.request, error: null });
    } catch {
      return internalError(context);
    }
  },
);

async function resolveRequest(
  context: Context,
  status: "resolved" | "rejected",
) {
  const parsed = resolutionSchema.safeParse(await readJson(context));
  if (!parsed.success)
    return validationError(context, "Invalid request resolution");
  const claims = claimsOf(context);
  const schoolId = claims.school_id;
  try {
    const result = await withTenant(schoolId, async (tx) => {
      const [request] = await tx
        .select()
        .from(parentRequests)
        .where(
          and(
            eq(parentRequests.id, context.req.param("id")!),
            eq(parentRequests.schoolId, schoolId),
          ),
        );
      if (!request) return { kind: "not_found" as const };
      if (
        claims.role === "teacher" &&
        !(await allowedForTeacher(tx, schoolId, claims.sub, request.childId))
      ) {
        return { kind: "forbidden" as const };
      }
      if (request.status !== "pending") return { kind: "not_pending" as const };
      const [updated] = await tx
        .update(parentRequests)
        .set({
          status,
          resolvedBy: claims.sub,
          resolvedAt: new Date(),
          response: parsed.data.response,
          note: parsed.data.note,
          updatedAt: new Date(),
        })
        .where(eq(parentRequests.id, request.id))
        .returning();
      await tx.insert(parentRequestHistory).values({
        id: crypto.randomUUID(),
        schoolId,
        requestId: request.id,
        status,
        changedBy: claims.sub,
        note: parsed.data.note,
      });
      return { kind: "saved" as const, request: updated };
    });
    if (result.kind === "not_found")
      return notFoundError(context, "Parent request not found");
    if (result.kind === "forbidden") return forbidden(context);
    if (result.kind === "not_pending")
      return validationError(context, "Only pending requests can be processed");
    return context.json({ success: true, data: result.request, error: null });
  } catch {
    return internalError(context);
  }
}

parentRequestRoutes.put(
  "/:id/resolve",
  requireAuth,
  requireRole(...roles),
  (context) => resolveRequest(context, "resolved"),
);

parentRequestRoutes.put(
  "/:id/reject",
  requireAuth,
  requireRole(...roles),
  (context) => resolveRequest(context, "rejected"),
);

parentRequestRoutes.delete(
  "/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [request] = await tx
          .select()
          .from(parentRequests)
          .where(
            and(
              eq(parentRequests.id, context.req.param("id")!),
              eq(parentRequests.schoolId, schoolId),
            ),
          );
        if (!request) return "missing" as const;
        if (
          claims.role === "teacher" &&
          !(await allowedForTeacher(tx, schoolId, claims.sub, request.childId))
        ) {
          return "forbidden" as const;
        }
        if (request.status !== "pending") return "not_pending" as const;
        await tx
          .delete(parentRequestAttachments)
          .where(eq(parentRequestAttachments.requestId, request.id));
        await tx
          .delete(parentRequestHistory)
          .where(eq(parentRequestHistory.requestId, request.id));
        await tx
          .delete(parentRequests)
          .where(eq(parentRequests.id, request.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Parent request not found");
      if (result === "forbidden") return forbidden(context);
      if (result === "not_pending")
        return validationError(context, "Only pending requests can be deleted");
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);
