import { afterEach, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { app } from "../../src/server";
import { db } from "../../src/db";
import { passwordResetTokens, users } from "../../src/db/schema";

const phones: string[] = [];

function nextPhone() {
  return `091${String(Date.now() + phones.length).slice(-7)}`;
}

async function createUser(phone: string) {
  phones.push(phone);
  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      globalPhone: phone,
      passwordHash: await Bun.password.hash("Old#123", {
        algorithm: "argon2id",
      }),
      displayName: "Reset User",
      sessionVersion: 3,
    })
    .returning();
  return user!;
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

afterEach(async () => {
  for (const phone of phones.splice(0)) {
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.globalPhone, phone));
    if (found[0]) {
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, found[0].id));
      await db.delete(users).where(eq(users.id, found[0].id));
    }
  }
});

test.serial(
  "password reset changes password and revokes previous sessions",
  async () => {
    const phone = nextPhone();
    const user = await createUser(phone);
    const rawToken = "reset-token-success";
    await db.insert(passwordResetTokens).values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await tokenHash(rawToken),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const response = await app.request("/api/v1/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone,
        token: rawToken,
        newPassword: "New#123456",
      }),
    });

    expect(response.status).toBe(200);
    const [updated] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(updated?.sessionVersion).toBe(4);
    expect(await Bun.password.verify("New#123456", updated!.passwordHash)).toBe(
      true,
    );
    const [used] = await db
      .select({ consumedAt: passwordResetTokens.consumedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    expect(used?.consumedAt).not.toBeNull();
  },
);

test.serial("expired reset token is rejected", async () => {
  const phone = nextPhone();
  const user = await createUser(phone);
  await db.insert(passwordResetTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await tokenHash("reset-token-expired"),
    expiresAt: new Date(Date.now() - 1000),
  });

  const response = await app.request("/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      phone,
      token: "reset-token-expired",
      newPassword: "New#123456",
    }),
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: "UNAUTHORIZED" },
  });
});

test.serial(
  "forgot-password creates a reset token without exposing account existence",
  async () => {
    const phone = nextPhone();
    const user = await createUser(phone);
    const previous = process.env.PASSWORD_RESET_EXPOSE_TOKEN;
    process.env.PASSWORD_RESET_EXPOSE_TOKEN = "true";
    try {
      const response = await app.request("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { resetToken?: string; message: string };
      };
      expect(body.data.resetToken).toBeTruthy();

      const [created] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.consumedAt),
          ),
        );
      expect(created).toBeDefined();
    } finally {
      if (previous === undefined)
        delete process.env.PASSWORD_RESET_EXPOSE_TOKEN;
      else process.env.PASSWORD_RESET_EXPOSE_TOKEN = previous;
    }
  },
);

test.serial("reset token attempts are capped", async () => {
  const phone = nextPhone();
  const user = await createUser(phone);
  await db.insert(passwordResetTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await tokenHash("reset-token-attempts"),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  const previous = process.env.RATE_LIMIT_OTP_MAX;
  process.env.RATE_LIMIT_OTP_MAX = "20";
  try {
    let last: Response | undefined;
    for (let index = 0; index < 6; index += 1) {
      last = await app.request("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          token: `wrong-token-${index}-long-enough`,
          newPassword: "New#123456",
        }),
      });
    }
    expect(last?.status).toBe(429);
    expect(await last?.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  } finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_OTP_MAX;
    else process.env.RATE_LIMIT_OTP_MAX = previous;
  }
});
