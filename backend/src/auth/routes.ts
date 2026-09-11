import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
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
import {
  passwordResetTokens,
  schoolMemberships,
  schools,
  systemAdmins,
  users,
} from "../db/schema";

const roleSchema = z.enum(["school_admin", "teacher", "staff", "parent"]);
const loginBodySchema = z.object({
  phone: z.string().regex(/^0\d{9}$/),
  password: z.string().min(1),
});
const adminLoginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
const forgotPasswordBodySchema = z.object({
  phone: z.string().regex(/^0\d{9}$/),
});
const resetPasswordBodySchema = z
  .object({
    phone: z.string().regex(/^0\d{9}$/),
    token: z.string().min(16).max(256),
    newPassword: z.string().min(6),
  })
  .strict();
const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  })
  .strict();
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

async function hashResetToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createResetToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 403 | 404 | 429 | 500,
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

authRoutes.post("/forgot-password", async (context) => {
  const parsedBody = forgotPasswordBodySchema.safeParse(
    await readJson(context),
  );
  if (!parsedBody.success) {
    return errorResponse(context, 400, "VALIDATION_ERROR", "Phone is required");
  }

  try {
    const [supportAdmin] = await db
      .select({ phone: systemAdmins.phone })
      .from(systemAdmins)
      .where(
        and(eq(systemAdmins.status, "active"), isNotNull(systemAdmins.phone)),
      )
      .orderBy(asc(systemAdmins.createdAt))
      .limit(1);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.globalPhone, parsedBody.data.phone),
          eq(users.status, "active"),
        ),
      );
    const resetToken = createResetToken();
    if (user) {
      await db
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.consumedAt),
          ),
        );
      await db.insert(passwordResetTokens).values({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: await hashResetToken(resetToken),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
    }

    const data: {
      message: string;
      supportPhone: string | null;
      resetToken?: string;
    } = {
      message: supportAdmin?.phone
        ? "Vui lòng liên hệ quản trị hệ thống để được cấp lại mật khẩu"
        : "Vui lòng liên hệ quản trị hệ thống",
      supportPhone: supportAdmin?.phone ?? null,
    };
    if (
      user &&
      process.env.PASSWORD_RESET_EXPOSE_TOKEN === "true" &&
      process.env.NODE_ENV !== "production"
    ) {
      data.resetToken = resetToken;
    }

    return context.json({
      success: true,
      data,
      error: null,
    });
  } catch {
    return context.json(
      { success: false, data: null, error: { code: "INTERNAL_ERROR" } },
      500,
    );
  }
});

authRoutes.post("/reset-password", async (context) => {
  const parsedBody = resetPasswordBodySchema.safeParse(await readJson(context));
  if (!parsedBody.success)
    return errorResponse(
      context,
      400,
      "VALIDATION_ERROR",
      "Invalid password reset",
    );

  const tokenHash = await hashResetToken(parsedBody.data.token);
  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          tokenId: passwordResetTokens.id,
          tokenHash: passwordResetTokens.tokenHash,
          userId: users.id,
          expiresAt: passwordResetTokens.expiresAt,
          attempts: passwordResetTokens.attempts,
          consumedAt: passwordResetTokens.consumedAt,
          status: users.status,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(
          and(
            eq(users.globalPhone, parsedBody.data.phone),
            isNull(passwordResetTokens.consumedAt),
          ),
        )
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1);
      if (!row || row.status !== "active" || row.expiresAt <= new Date())
        return { kind: "invalid" as const };
      if (row.attempts >= 5) return { kind: "limited" as const };
      if (row.tokenHash !== tokenHash) {
        await tx
          .update(passwordResetTokens)
          .set({ attempts: sql`${passwordResetTokens.attempts} + 1` })
          .where(eq(passwordResetTokens.id, row.tokenId));
        return { kind: "invalid" as const };
      }

      await tx
        .update(users)
        .set({
          passwordHash: await Bun.password.hash(parsedBody.data.newPassword, {
            algorithm: "argon2id",
          }),
          mustChangePassword: false,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, row.userId));
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.tokenId));
      return { kind: "reset" as const };
    });

    if (result.kind === "limited")
      return errorResponse(
        context,
        429,
        "RATE_LIMITED",
        "Too many reset attempts",
      );
    if (result.kind === "invalid")
      return errorResponse(
        context,
        401,
        "UNAUTHORIZED",
        "Invalid or expired reset token",
      );
    return context.json({
      success: true,
      data: { message: "Đổi mật khẩu thành công" },
      error: null,
    });
  } catch {
    return errorResponse(
      context,
      500,
      "INTERNAL_ERROR",
      "Internal server error",
    );
  }
});

authRoutes.post("/change-password", requireAuth, async (context) => {
  const parsedBody = changePasswordBodySchema.safeParse(
    await readJson(context),
  );
  if (!parsedBody.success) {
    return errorResponse(
      context,
      400,
      "VALIDATION_ERROR",
      "Invalid password change",
    );
  }

  const claims = context.get("auth").claims;
  if (claims.role === "system_admin" || claims.role === "context_selection") {
    return errorResponse(context, 403, "FORBIDDEN", "Tenant account required");
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, claims.sub));
    if (!user || user.status !== "active") {
      return errorResponse(context, 404, "NOT_FOUND", "User not found");
    }
    if (
      !(await Bun.password.verify(
        parsedBody.data.currentPassword,
        user.passwordHash,
      ))
    ) {
      return errorResponse(context, 401, "UNAUTHORIZED", "Invalid password");
    }
    if (parsedBody.data.currentPassword === parsedBody.data.newPassword) {
      return errorResponse(
        context,
        400,
        "VALIDATION_ERROR",
        "New password must be different",
      );
    }

    await db
      .update(users)
      .set({
        passwordHash: await Bun.password.hash(parsedBody.data.newPassword, {
          algorithm: "argon2id",
        }),
        mustChangePassword: false,
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, user.id));
    return context.json({ success: true, data: null, error: null });
  } catch {
    return context.json(
      { success: false, data: null, error: { code: "INTERNAL_ERROR" } },
      500,
    );
  }
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
