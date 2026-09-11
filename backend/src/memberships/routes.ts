import { and, asc, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { withTenant } from "../db/tenant";
import { getClientIp, recordAuditLog } from "../db/audit";
import {
  classes,
  schoolMemberships,
  teacherAssignments,
  users,
} from "../db/schema";
import {
  internalError,
  notFoundError,
  validationError,
} from "../http/errors";

const roleUpdateSchema = z
  .object({
    role: z.enum(["school_admin", "teacher", "staff", "parent"]),
  })
  .strict();

const statusUpdateSchema = z
  .object({
    status: z.enum(["active", "locked", "revoked"]),
  })
  .strict();

function schoolIdOf(context: Parameters<typeof requireAuth>[0]) {
  return (context.get("auth").claims as TenantAccessTokenClaims).school_id;
}

function actorIdOf(context: Parameters<typeof requireAuth>[0]) {
  return (context.get("auth").claims as TenantAccessTokenClaims).sub;
}

export const membershipRoutes = new Hono();

membershipRoutes.use("*", requireAuth, requireRole("school_admin"));

membershipRoutes.get("/", async (context) => {
  const schoolId = schoolIdOf(context);
  const queryRole = context.req.query("role");
  const queryStatus = context.req.query("status");
  const search = context.req.query("search")?.trim();
  const page = Math.max(1, Number(context.req.query("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(context.req.query("limit")) || 20));

  try {
    const data = await withTenant(schoolId, async (tx) => {
      const filters = [eq(schoolMemberships.schoolId, schoolId)];
      if (
        queryRole &&
        ["school_admin", "teacher", "staff", "parent"].includes(queryRole)
      ) {
        filters.push(eq(schoolMemberships.role, queryRole));
      }
      if (
        queryStatus &&
        ["active", "locked", "revoked"].includes(queryStatus)
      ) {
        filters.push(eq(schoolMemberships.status, queryStatus));
      }
      if (search) {
        filters.push(
          or(
            ilike(users.displayName, `%${search}%`),
            ilike(users.globalPhone, `%${search}%`),
          )!,
        );
      }

      const whereClause = and(...filters);

      const items = await tx
        .select({
          membershipId: schoolMemberships.id,
          userId: users.id,
          displayName: users.displayName,
          globalPhone: users.globalPhone,
          email: users.email,
          role: schoolMemberships.role,
          status: schoolMemberships.status,
          createdAt: schoolMemberships.createdAt,
        })
        .from(schoolMemberships)
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(whereClause)
        .orderBy(asc(schoolMemberships.createdAt), asc(schoolMemberships.id))
        .limit(limit)
        .offset((page - 1) * limit);

      const [totalRow] = await tx
        .select({ total: count() })
        .from(schoolMemberships)
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(whereClause);

      return {
        items,
        total: Number(totalRow?.total ?? 0),
        page,
        limit,
      };
    });

    return context.json({ success: true, data, error: null });
  } catch {
    return internalError(context);
  }
});

membershipRoutes.get("/:id", async (context) => {
  const schoolId = schoolIdOf(context);
  const membershipId = context.req.param("id")!;

  try {
    const data = await withTenant(schoolId, async (tx) => {
      const [member] = await tx
        .select({
          membershipId: schoolMemberships.id,
          userId: users.id,
          displayName: users.displayName,
          globalPhone: users.globalPhone,
          email: users.email,
          role: schoolMemberships.role,
          status: schoolMemberships.status,
          createdAt: schoolMemberships.createdAt,
        })
        .from(schoolMemberships)
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(
          and(
            eq(schoolMemberships.id, membershipId),
            eq(schoolMemberships.schoolId, schoolId),
          ),
        );

      if (!member) return null;

      let assignments: any[] = [];
      if (member.role === "teacher") {
        assignments = await tx
          .select({
            id: teacherAssignments.id,
            classId: teacherAssignments.classId,
            className: classes.name,
            assignedAt: teacherAssignments.assignedAt,
            status: teacherAssignments.status,
          })
          .from(teacherAssignments)
          .innerJoin(classes, eq(classes.id, teacherAssignments.classId))
          .where(
            and(
              eq(teacherAssignments.schoolId, schoolId),
              eq(teacherAssignments.teacherId, member.userId),
              eq(teacherAssignments.status, "active"),
            ),
          );
      }

      return {
        ...member,
        teacherAssignments: assignments,
      };
    });

    return data
      ? context.json({ success: true, data, error: null })
      : notFoundError(context, "Membership not found");
  } catch {
    return internalError(context);
  }
});

membershipRoutes.patch("/:id/role", async (context) => {
  const schoolId = schoolIdOf(context);
  const membershipId = context.req.param("id")!;

  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return validationError(context, "Invalid JSON body");
  }
  const parsed = roleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(context, "Invalid role parameter");
  }

  try {
    const result = await withTenant(schoolId, async (tx) => {
      const [matched] = await tx
        .select()
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.id, membershipId),
            eq(schoolMemberships.schoolId, schoolId),
          ),
        );

      if (!matched) return { kind: "not_found" as const };

      // Guard against demoting last active school admin
      if (
        matched.role === "school_admin" &&
        matched.status === "active" &&
        parsed.data.role !== "school_admin"
      ) {
        const [otherAdmins] = await tx
          .select({ total: count() })
          .from(schoolMemberships)
          .where(
            and(
              eq(schoolMemberships.schoolId, schoolId),
              eq(schoolMemberships.role, "school_admin"),
              eq(schoolMemberships.status, "active"),
              ne(schoolMemberships.id, matched.id),
            ),
          );
        if (Number(otherAdmins?.total ?? 0) === 0) {
          return { kind: "last_admin" as const };
        }
      }

      // If demoted from teacher, clean up assignments and class teacher pointers
      if (matched.role === "teacher" && parsed.data.role !== "teacher") {
        await tx
          .update(teacherAssignments)
          .set({ status: "archived" })
          .where(
            and(
              eq(teacherAssignments.schoolId, schoolId),
              eq(teacherAssignments.teacherId, matched.userId),
              eq(teacherAssignments.status, "active"),
            ),
          );

        await tx
          .update(classes)
          .set({ teacherId: null })
          .where(
            and(
              eq(classes.schoolId, schoolId),
              eq(classes.teacherId, matched.userId),
            ),
          );
      }

      const [updated] = await tx
        .update(schoolMemberships)
        .set({ role: parsed.data.role })
        .where(eq(schoolMemberships.id, matched.id))
        .returning();

      await recordAuditLog(tx, {
        actorId: actorIdOf(context),
        schoolId,
        action: "membership.role_update",
        targetType: "school_membership",
        targetId: matched.id,
        before: matched,
        after: updated,
        extra: { oldRole: matched.role, newRole: parsed.data.role },
        ipAddress: getClientIp(context),
      });

      return { kind: "ok" as const, membership: updated };
    });

    if (result.kind === "not_found") {
      return notFoundError(context, "Membership not found");
    }
    if (result.kind === "last_admin") {
      return validationError(
        context,
        "Cannot demote the last active school admin",
      );
    }

    return context.json({
      success: true,
      data: result.membership,
      error: null,
    });
  } catch {
    return internalError(context);
  }
});

membershipRoutes.patch("/:id/status", async (context) => {
  const schoolId = schoolIdOf(context);
  const membershipId = context.req.param("id")!;

  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return validationError(context, "Invalid JSON body");
  }
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(context, "Invalid status parameter");
  }

  try {
    const result = await withTenant(schoolId, async (tx) => {
      const [matched] = await tx
        .select()
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.id, membershipId),
            eq(schoolMemberships.schoolId, schoolId),
          ),
        );

      if (!matched) return { kind: "not_found" as const };

      // Guard against locking or revoking last active school admin
      if (
        matched.role === "school_admin" &&
        matched.status === "active" &&
        parsed.data.status !== "active"
      ) {
        const [otherAdmins] = await tx
          .select({ total: count() })
          .from(schoolMemberships)
          .where(
            and(
              eq(schoolMemberships.schoolId, schoolId),
              eq(schoolMemberships.role, "school_admin"),
              eq(schoolMemberships.status, "active"),
              ne(schoolMemberships.id, matched.id),
            ),
          );
        if (Number(otherAdmins?.total ?? 0) === 0) {
          return { kind: "last_admin" as const };
        }
      }

      // If status revoked, clean up teacher assignments
      if (parsed.data.status === "revoked" && matched.role === "teacher") {
        await tx
          .update(teacherAssignments)
          .set({ status: "archived" })
          .where(
            and(
              eq(teacherAssignments.schoolId, schoolId),
              eq(teacherAssignments.teacherId, matched.userId),
              eq(teacherAssignments.status, "active"),
            ),
          );

        await tx
          .update(classes)
          .set({ teacherId: null })
          .where(
            and(
              eq(classes.schoolId, schoolId),
              eq(classes.teacherId, matched.userId),
            ),
          );
      }

      // If status revoked and user has no other active memberships across all schools
      if (parsed.data.status === "revoked") {
        const [otherActive] = await tx
          .select({ total: count() })
          .from(schoolMemberships)
          .where(
            and(
              eq(schoolMemberships.userId, matched.userId),
              eq(schoolMemberships.status, "active"),
              ne(schoolMemberships.id, matched.id),
            ),
          );
        if (Number(otherActive?.total ?? 0) === 0) {
          await tx
            .update(users)
            .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
            .where(eq(users.id, matched.userId));
        }
      }

      const [updated] = await tx
        .update(schoolMemberships)
        .set({ status: parsed.data.status })
        .where(eq(schoolMemberships.id, matched.id))
        .returning();

      await recordAuditLog(tx, {
        actorId: actorIdOf(context),
        schoolId,
        action: "membership.status_update",
        targetType: "school_membership",
        targetId: matched.id,
        before: matched,
        after: updated,
        extra: { oldStatus: matched.status, newStatus: parsed.data.status },
        ipAddress: getClientIp(context),
      });

      return { kind: "ok" as const, membership: updated };
    });

    if (result.kind === "not_found") {
      return notFoundError(context, "Membership not found");
    }
    if (result.kind === "last_admin") {
      return validationError(
        context,
        "Cannot lock or revoke the last active school admin",
      );
    }

    return context.json({
      success: true,
      data: result.membership,
      error: null,
    });
  } catch {
    return internalError(context);
  }
});

membershipRoutes.delete("/:id", async (context) => {
  const schoolId = schoolIdOf(context);
  const membershipId = context.req.param("id")!;

  try {
    const result = await withTenant(schoolId, async (tx) => {
      const [matched] = await tx
        .select()
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.id, membershipId),
            eq(schoolMemberships.schoolId, schoolId),
          ),
        );

      if (!matched || matched.status === "revoked") {
        return { kind: "not_found" as const };
      }

      // Guard against deleting last active school admin
      if (matched.role === "school_admin" && matched.status === "active") {
        const [otherAdmins] = await tx
          .select({ total: count() })
          .from(schoolMemberships)
          .where(
            and(
              eq(schoolMemberships.schoolId, schoolId),
              eq(schoolMemberships.role, "school_admin"),
              eq(schoolMemberships.status, "active"),
              ne(schoolMemberships.id, matched.id),
            ),
          );
        if (Number(otherAdmins?.total ?? 0) === 0) {
          return { kind: "last_admin" as const };
        }
      }

      // Archive teacher assignments if teacher
      if (matched.role === "teacher") {
        await tx
          .update(teacherAssignments)
          .set({ status: "archived" })
          .where(
            and(
              eq(teacherAssignments.schoolId, schoolId),
              eq(teacherAssignments.teacherId, matched.userId),
              eq(teacherAssignments.status, "active"),
            ),
          );

        await tx
          .update(classes)
          .set({ teacherId: null })
          .where(
            and(
              eq(classes.schoolId, schoolId),
              eq(classes.teacherId, matched.userId),
            ),
          );
      }

      // If user has no other active memberships across all schools, bump sessionVersion
      const [otherActive] = await tx
        .select({ total: count() })
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.userId, matched.userId),
            eq(schoolMemberships.status, "active"),
            ne(schoolMemberships.id, matched.id),
          ),
        );
      if (Number(otherActive?.total ?? 0) === 0) {
        await tx
          .update(users)
          .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
          .where(eq(users.id, matched.userId));
      }

      const [updated] = await tx
        .update(schoolMemberships)
        .set({ status: "revoked" })
        .where(eq(schoolMemberships.id, matched.id))
        .returning();

      await recordAuditLog(tx, {
        actorId: actorIdOf(context),
        schoolId,
        action: "membership.revoke",
        targetType: "school_membership",
        targetId: matched.id,
        before: matched,
        after: updated,
        ipAddress: getClientIp(context),
      });

      return { kind: "ok" as const, membership: updated };
    });

    if (result.kind === "not_found") {
      return notFoundError(context, "Membership not found");
    }
    if (result.kind === "last_admin") {
      return validationError(
        context,
        "Cannot revoke the last active school admin",
      );
    }

    return context.json({
      success: true,
      data: { id: result.membership!.id, status: "revoked" },
      error: null,
    });
  } catch {
    return internalError(context);
  }
});
