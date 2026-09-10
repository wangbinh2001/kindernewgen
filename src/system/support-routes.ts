import { and, count, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  createSystemAdminToken,
  type SystemAdminAccessTokenClaims,
  type TenantAccessTokenClaims,
} from "../auth/jwt";
import {
  requireAuth,
  requireRole,
  requireSystemAdmin,
} from "../auth/middleware";
import { db } from "../db";
import { withTenant } from "../db/tenant";
import { auditLogs, supportRequests } from "../db/schema";
import { internalError, notFoundError, validationError } from "../http/errors";

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function ipAddress(context: Context) {
  return context.req.header("x-forwarded-for")?.split(",")[0]?.trim();
}

const supportRequestSchema = z
  .object({
    title: z.string().trim().min(1),
    reason: z.string().trim().min(1),
  })
  .strict();

const approveSchema = z
  .object({
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

const supportSessionSchema = z
  .object({ supportRequestId: z.string().min(1) })
  .strict();

const auditQuerySchema = z.object({
  schoolId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  actorType: z.enum(["system_admin", "user"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const schoolSupportRoutes = new Hono();

schoolSupportRoutes.post(
  "/requests",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = supportRequestSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid support request");
    const claims = context.get("auth").claims as TenantAccessTokenClaims;
    try {
      const request = await withTenant(claims.school_id, async (tx) => {
        const [created] = await tx
          .insert(supportRequests)
          .values({
            id: crypto.randomUUID(),
            schoolId: claims.school_id,
            requesterId: claims.sub,
            title: parsed.data.title,
            reason: parsed.data.reason,
          })
          .returning();
        if (!created) throw new Error("Support request was not created");
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorType: "user",
          actorId: claims.sub,
          schoolId: claims.school_id,
          supportSessionId: created.id,
          action: "support_request_created",
          targetType: "support_request",
          targetId: created.id,
          metadata: { title: created.title },
          ipAddress: ipAddress(context),
        });
        return created;
      });
      return context.json({ success: true, data: request, error: null }, 201);
    } catch {
      return internalError(context);
    }
  },
);

export const systemSupportRoutes = new Hono();

systemSupportRoutes.get(
  "/support/requests",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const status = context.req.query("status");
    try {
      const where = status ? eq(supportRequests.status, status) : undefined;
      const data = await db
        .select()
        .from(supportRequests)
        .where(where)
        .orderBy(desc(supportRequests.createdAt));
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

systemSupportRoutes.patch(
  "/support/requests/:id/approve",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = approveSchema.safeParse((await readJson(context)) ?? {});
    if (!parsed.success)
      return validationError(context, "Invalid approval request");
    const claims = context.get("auth").claims as SystemAdminAccessTokenClaims;
    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (expiresAt <= new Date())
      return validationError(context, "Expiry must be in the future");
    try {
      const result = await db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(supportRequests)
          .where(
            and(
              eq(supportRequests.id, context.req.param("id")!),
              eq(supportRequests.status, "pending"),
            ),
          );
        if (!request) return { kind: "not_found" as const };
        const approvedAt = new Date();
        const [updated] = await tx
          .update(supportRequests)
          .set({
            status: "approved",
            approvedBy: claims.sub,
            approvedAt,
            expiresAt,
          })
          .where(eq(supportRequests.id, request.id))
          .returning();
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorType: "system_admin",
          actorId: claims.sub,
          schoolId: request.schoolId,
          supportSessionId: request.id,
          action: "support_request_approved",
          targetType: "support_request",
          targetId: request.id,
          metadata: { expiresAt: expiresAt.toISOString() },
          ipAddress: ipAddress(context),
        });
        return { kind: "updated" as const, data: updated };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Support request not found");
      return context.json({ success: true, data: result.data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

systemSupportRoutes.post(
  "/support/session/start",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = supportSessionSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "supportRequestId is required");
    const claims = context.get("auth").claims as SystemAdminAccessTokenClaims;
    try {
      const [request] = await db
        .select()
        .from(supportRequests)
        .where(
          and(
            eq(supportRequests.id, parsed.data.supportRequestId),
            eq(supportRequests.status, "approved"),
            gt(supportRequests.expiresAt, new Date()),
          ),
        );
      if (!request || !request.expiresAt)
        return validationError(
          context,
          "Support request is expired or inactive",
        );
      const expiresIn = `${Math.max(1, Math.floor((request.expiresAt.getTime() - Date.now()) / 1000))}s`;
      const token = await createSystemAdminToken({
        sub: claims.sub,
        role: "system_admin",
        session_version: 1,
        school_id: request.schoolId,
        support_session_id: request.id,
        scope: "read_only",
        expiresIn,
      });
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorType: "system_admin",
        actorId: claims.sub,
        schoolId: request.schoolId,
        supportSessionId: request.id,
        action: "support_session_started",
        targetType: "support_request",
        targetId: request.id,
        ipAddress: ipAddress(context),
      });
      return context.json({
        success: true,
        data: { token, expiresAt: request.expiresAt },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

systemSupportRoutes.post(
  "/support/session/end",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = supportSessionSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "supportRequestId is required");
    const claims = context.get("auth").claims as SystemAdminAccessTokenClaims;
    try {
      const result = await db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(supportRequests)
          .where(eq(supportRequests.id, parsed.data.supportRequestId));
        if (!request) return { kind: "not_found" as const };
        const [updated] = await tx
          .update(supportRequests)
          .set({ status: "expired", expiresAt: new Date() })
          .where(eq(supportRequests.id, request.id))
          .returning();
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorType: "system_admin",
          actorId: claims.sub,
          schoolId: request.schoolId,
          supportSessionId: request.id,
          action: "support_session_ended",
          targetType: "support_request",
          targetId: request.id,
          ipAddress: ipAddress(context),
        });
        return { kind: "updated" as const, data: updated };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Support request not found");
      return context.json({ success: true, data: result.data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

systemSupportRoutes.get(
  "/audit-logs",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = auditQuerySchema.safeParse(context.req.query());
    if (!parsed.success)
      return validationError(context, "Invalid audit log query");
    const { schoolId, action, actorType, page, limit } = parsed.data;
    const filters = [];
    if (schoolId) filters.push(eq(auditLogs.schoolId, schoolId));
    if (action) filters.push(eq(auditLogs.action, action));
    if (actorType) filters.push(eq(auditLogs.actorType, actorType));
    const where = filters.length ? and(...filters) : undefined;
    try {
      const [items, total] = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.timestamp))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ value: count() }).from(auditLogs).where(where),
      ]);
      return context.json({
        success: true,
        data: { items, total: Number(total[0]?.value ?? 0), page, limit },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);
