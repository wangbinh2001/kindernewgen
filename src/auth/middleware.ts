import type { Context, Next } from "hono";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import {
  schoolMemberships,
  schools,
  supportRequests,
  systemAdmins,
  users,
} from "../db/schema";

export type AuthContext = {
  claims: AccessTokenClaims;
};

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export async function requireAuth(context: Context, next: Next) {
  const authorization = context.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
      },
      401,
    );
  }

  try {
    const claims = await verifyAccessToken(authorization.slice(7));
    if (claims.role === "system_admin") {
      const [admin] = await db
        .select({ status: systemAdmins.status })
        .from(systemAdmins)
        .where(eq(systemAdmins.id, claims.sub));
      let supportActive = true;
      if (claims.scope === "read_only") {
        if (claims.support_session_id && claims.school_id) {
          const [session] = await db
            .select({ id: supportRequests.id })
            .from(supportRequests)
            .where(
              and(
                eq(supportRequests.id, claims.support_session_id),
                eq(supportRequests.schoolId, claims.school_id),
                eq(supportRequests.status, "approved"),
                gt(supportRequests.expiresAt, new Date()),
              ),
            );
          supportActive = Boolean(session);
        } else {
          supportActive = false;
        }
      }
      if (!admin || admin.status !== "active" || !supportActive) {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "UNAUTHORIZED",
              message: "Session expired or revoked",
            },
          },
          401,
        );
      }
    } else if (claims.role === "context_selection") {
      const [user] = await db
        .select({ status: users.status, sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, claims.sub));
      if (
        !user ||
        user.status !== "active" ||
        user.sessionVersion !== claims.session_version
      ) {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "UNAUTHORIZED",
              message: "Session expired or revoked",
            },
          },
          401,
        );
      }
    } else {
      const [user] = await db
        .select({
          id: users.id,
          status: users.status,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .where(eq(users.id, claims.sub));
      const [membership] = await db
        .select({ id: schoolMemberships.id })
        .from(schoolMemberships)
        .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
        .where(
          and(
            eq(schoolMemberships.id, claims.membership_id),
            eq(schoolMemberships.userId, claims.sub),
            eq(schoolMemberships.schoolId, claims.school_id),
            eq(schoolMemberships.status, "active"),
            eq(schools.status, "active"),
          ),
        );
      if (
        !user ||
        user.status !== "active" ||
        user.sessionVersion !== claims.session_version ||
        !membership
      ) {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "UNAUTHORIZED",
              message: "Session expired or revoked",
            },
          },
          401,
        );
      }
    }
    context.set("auth", { claims });
    await next();
  } catch {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      },
      401,
    );
  }
}

export function requireRole(...allowedRoles: AccessTokenClaims["role"][]) {
  return async (context: Context, next: Next) => {
    const auth = context.get("auth");
    if (!auth) {
      return context.json(
        {
          success: false,
          data: null,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        401,
      );
    }

    const supportReadOnly =
      auth.claims.role === "system_admin" &&
      auth.claims.scope === "read_only" &&
      context.req.method === "GET";
    if (!supportReadOnly && !allowedRoles.includes(auth.claims.role)) {
      return context.json(
        {
          success: false,
          data: null,
          error: { code: "FORBIDDEN", message: "Insufficient permissions" },
        },
        403,
      );
    }

    await next();
  };
}

export async function requireSystemAdmin(context: Context, next: Next) {
  const auth = context.get("auth");
  if (!auth) {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      },
      401,
    );
  }
  if (
    auth.claims.role !== "system_admin" ||
    auth.claims.scope === "read_only"
  ) {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "System admin access required" },
      },
      403,
    );
  }
  await next();
}
