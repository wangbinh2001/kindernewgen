import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRole } from "./middleware";
import type { TenantAccessTokenClaims } from "./jwt";
import { withTenant } from "../db/tenant";
import { schoolMemberships, users } from "../db/schema";
import { internalError, notFoundError } from "../http/errors";

function schoolIdOf(context: Parameters<typeof requireAuth>[0]) {
  return (context.get("auth").claims as TenantAccessTokenClaims).school_id;
}

export const recoveryRoutes = new Hono();
recoveryRoutes.use("*", requireAuth, requireRole("school_admin"));

recoveryRoutes.post("/:id/reset-password", async (context) => {
  const schoolId = schoolIdOf(context);
  const userId = context.req.param("id")!;
  const temporaryPassword = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 12);

  try {
    const data = await withTenant(schoolId, async (tx) => {
      const [membership] = await tx
        .select({ userId: schoolMemberships.userId })
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.userId, userId),
            eq(schoolMemberships.schoolId, schoolId),
            inArray(schoolMemberships.role, ["parent", "teacher", "staff"]),
          ),
        );
      if (!membership) return null;

      const [updated] = await tx
        .update(users)
        .set({
          passwordHash: await Bun.password.hash(temporaryPassword, {
            algorithm: "argon2id",
          }),
          mustChangePassword: true,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      return updated ? { userId: updated.id } : null;
    });

    return data
      ? context.json({
          success: true,
          data: {
            ...data,
            temporaryPassword,
            mustChangePassword: true,
          },
          error: null,
        })
      : notFoundError(context, "User not found in this school");
  } catch {
    return internalError(context);
  }
});
