import { Hono } from "hono";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { requireAuth } from "../../src/auth/middleware";
import { createAccessToken } from "../../src/auth/jwt";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";

test("requireAuth rejects missing bearer token", async () => {
  const app = new Hono();
  app.get("/protected", requireAuth, (context) => context.json({ ok: true }));

  const response = await app.request("/protected");
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    data: null,
    error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
  });
});

test("requireAuth accepts valid tenant token", async () => {
  const id = crypto.randomUUID();
  const schoolId = `test-auth-middleware-${id}`;
  const phone = `0992${id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;
  await db.insert(schools).values({ id: schoolId, name: schoolId });
  await registerParent({ phone, schoolId, displayName: "Middleware User" });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, phone));
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, schoolId),
      ),
    );
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, schoolId),
      ),
    );
  const token = await createAccessToken({
    sub: user!.id,
    membership_id: membership!.id,
    school_id: schoolId,
    role: "school_admin",
    session_version: user!.sessionVersion,
  });

  const app = new Hono();
  app.get("/protected", requireAuth, (context) =>
    context.json({ claims: context.get("auth").claims }),
  );

  try {
    const response = await app.request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      claims: { school_id: schoolId },
    });
  } finally {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user!.id));
    await db.delete(users).where(eq(users.id, user!.id));
    await db.delete(schools).where(eq(schools.id, schoolId));
  }
});
