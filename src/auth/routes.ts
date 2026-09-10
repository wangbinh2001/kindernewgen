import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "./middleware";
import { z } from "zod";
import {
  createAccessToken,
  createContextSelectionToken,
  createSystemAdminToken,
  type TenantAccessTokenClaims,
} from "./jwt";
import { db } from "../db";
import { schoolMemberships, schools, systemAdmins, users } from "../db/schema";

const roleSchema = z.enum(["school_admin", "teacher", "staff", "parent"]);
const loginBodySchema = z.object({
  phone: z.string().regex(/^0\d{9}$/),
  password: z.string().min(1),
});
const adminLoginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
const selectContextBodySchema = z.object({
  membership_id: z.string().min(1),
});

const INVALID_CREDENTIALS = "Sai tài khoản hoặc mật khẩu";

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 404,
  code: string,
  message: string,
) {
  return context.json(
    {
      success: false,
      data: null,
      error: { code, message },
    },
    status,
  );
}

function getRole(role: string): TenantAccessTokenClaims["role"] | null {
  const result = roleSchema.safeParse(role);
  return result.success ? result.data : null;
}

async function createMembershipToken(
  user: typeof users.$inferSelect,
  membership: typeof schoolMemberships.$inferSelect,
) {
  const role = getRole(membership.role);
  if (!role) {
    return null;
  }

  return createAccessToken({
    sub: user.id,
    membership_id: membership.id,
    school_id: membership.schoolId,
    role,
    session_version: user.sessionVersion,
  });
}

export const authRoutes = new Hono();

authRoutes.post("/login", async (context) => {
  const parsedBody = loginBodySchema.safeParse(await readJson(context));
  if (!parsedBody.success) {
    return errorResponse(
      context,
      400,
      "VALIDATION_ERROR",
      "Phone and password are required",
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, parsedBody.data.phone));

  if (
    !user ||
    user.status !== "active" ||
    !(await Bun.password.verify(parsedBody.data.password, user.passwordHash))
  ) {
    return errorResponse(context, 401, "UNAUTHORIZED", INVALID_CREDENTIALS);
  }

  const memberships = await db
    .select()
    .from(schoolMemberships)
    .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
    .where(
      and(
        eq(schoolMemberships.userId, user.id),
        eq(schoolMemberships.status, "active"),
        eq(schools.status, "active"),
      ),
    );

  const activeMemberships = memberships.map((row) => row.school_memberships);

  if (activeMemberships.length === 1) {
    const token = await createMembershipToken(user, activeMemberships[0]!);
    if (!token) {
      return errorResponse(context, 401, "UNAUTHORIZED", INVALID_CREDENTIALS);
    }

    return context.json({
      success: true,
      data: { token },
      error: null,
    });
  }

  const contextToken = await createContextSelectionToken({
    sub: user.id,
    role: "context_selection",
    scope: "context_selection",
    session_version: user.sessionVersion,
  });

  return context.json({
    success: true,
    data: {
      context_token: contextToken,
      memberships: activeMemberships.flatMap((membership) => {
        const role = getRole(membership.role);
        return role
          ? [{ id: membership.id, school_id: membership.schoolId, role }]
          : [];
      }),
    },
    error: null,
  });
});

authRoutes.post("/admin/login", async (context) => {
  const parsedBody = adminLoginBodySchema.safeParse(await readJson(context));
  if (!parsedBody.success) {
    return errorResponse(
      context,
      400,
      "VALIDATION_ERROR",
      "Username and password are required",
    );
  }

  const [admin] = await db
    .select()
    .from(systemAdmins)
    .where(eq(systemAdmins.username, parsedBody.data.username));
  if (
    !admin ||
    admin.status !== "active" ||
    !(await Bun.password.verify(parsedBody.data.password, admin.passwordHash))
  ) {
    return errorResponse(context, 401, "UNAUTHORIZED", INVALID_CREDENTIALS);
  }

  const token = await createSystemAdminToken({
    sub: admin.id,
    role: "system_admin",
    session_version: 1,
  });
  return context.json({ success: true, data: { token }, error: null });
});

authRoutes.post("/logout", requireAuth, (context) =>
  context.json({
    success: true,
    data: { message: "Đăng xuất thành công" },
    error: null,
  }),
);

authRoutes.post("/logout-all", requireAuth, async (context) => {
  const claims = context.get("auth").claims;
  if (claims.role === "system_admin") {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "Tenant session required" },
      },
      403,
    );
  }
  try {
    const [user] = await db
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, claims.sub))
      .returning({ id: users.id });
    if (!user) {
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
    return context.json({
      success: true,
      data: { message: "Đăng xuất toàn bộ thành công" },
      error: null,
    });
  } catch {
    return context.json(
      { success: false, data: null, error: { code: "INTERNAL_ERROR" } },
      500,
    );
  }
});

authRoutes.post("/select-context", requireAuth, async (context) => {
  const parsedBody = selectContextBodySchema.safeParse(await readJson(context));
  if (!parsedBody.success) {
    return errorResponse(
      context,
      400,
      "VALIDATION_ERROR",
      "membership_id is required",
    );
  }

  const userId = context.get("auth").claims.sub;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.id, parsedBody.data.membership_id),
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.status, "active"),
      ),
    );

  if (!user || user.status !== "active" || !membership) {
    return errorResponse(context, 404, "NOT_FOUND", "Membership not found");
  }

  const token = await createMembershipToken(user, membership);
  if (!token) {
    return errorResponse(context, 404, "NOT_FOUND", "Membership not found");
  }

  return context.json({
    success: true,
    data: { token },
    error: null,
  });
});
