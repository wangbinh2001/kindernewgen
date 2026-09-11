import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { withTenant } from "../db/tenant";
import { notifications } from "../db/schema";
import { internalError, notFoundError, validationError } from "../http/errors";

const pageSchema = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

export const notificationRoutes = new Hono();

notificationRoutes.get(
  "/",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    const page = pageSchema(context.req.query("page"), 1);
    const limit = pageSchema(context.req.query("limit"), 20);
    if (!page || !limit || limit > 100) {
      return validationError(context, "Invalid notification pagination");
    }
    const claims = claimsOf(context);
    const unreadOnly = context.req.query("unreadOnly") === "true";
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const conditions = [
          eq(notifications.schoolId, claims.school_id),
          eq(notifications.recipientId, claims.sub),
        ];
        if (unreadOnly) conditions.push(isNull(notifications.readAt));
        const items = await tx
          .select()
          .from(notifications)
          .where(and(...conditions))
          .orderBy(desc(notifications.createdAt), desc(notifications.id))
          .limit(limit)
          .offset((page - 1) * limit);
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(
            and(
              eq(notifications.schoolId, claims.school_id),
              eq(notifications.recipientId, claims.sub),
              isNull(notifications.readAt),
            ),
          );
        return {
          items,
          unreadCount: Number(countRow?.count ?? 0),
          page,
          limit,
        };
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

notificationRoutes.patch(
  "/:id/read",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const result = await withTenant(claims.school_id, async (tx) => {
        const [notification] = await tx
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.id, context.req.param("id")!),
              eq(notifications.schoolId, claims.school_id),
              eq(notifications.recipientId, claims.sub),
            ),
          )
          .returning();
        return notification;
      });
      return result
        ? context.json({ success: true, data: result, error: null })
        : notFoundError(context, "Notification not found");
    } catch {
      return internalError(context);
    }
  },
);

notificationRoutes.post(
  "/read-all",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const result = await withTenant(claims.school_id, async (tx) => {
        const updated = await tx
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.schoolId, claims.school_id),
              eq(notifications.recipientId, claims.sub),
              isNull(notifications.readAt),
            ),
          )
          .returning({ id: notifications.id });
        return { updatedCount: updated.length };
      });
      return context.json({ success: true, data: result, error: null });
    } catch {
      return internalError(context);
    }
  },
);
