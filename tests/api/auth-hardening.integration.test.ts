import { afterEach, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { verifyAccessToken } from "../../src/auth/jwt";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";
import { app } from "../../src/server";

const SCHOOL_A = "test-school-auth-hardening-a";
const SCHOOL_B = "test-school-auth-hardening-b";
const PHONES = ["0911000901", "0911000902"];

async function ensureSchools() {
  await db
    .insert(schools)
    .values([
      { id: SCHOOL_A, name: "Test School Auth Hardening A" },
      { id: SCHOOL_B, name: "Test School Auth Hardening B" },
    ])
    .onConflictDoNothing();
}

async function cleanup() {
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, PHONES[0]!));
  const second = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, PHONES[1]!));
  const userIds = [...found, ...second].map((user) => user.id);
  if (userIds.length) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, userIds[0]!));
    for (const userId of userIds.slice(1)) {
      await db
        .delete(schoolMemberships)
        .where(eq(schoolMemberships.userId, userId));
    }
    for (const userId of userIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
  }
  await db.delete(schools).where(eq(schools.id, SCHOOL_A));
  await db.delete(schools).where(eq(schools.id, SCHOOL_B));
}

afterEach(cleanup);

test("multi-school login issues a context-selection token", async () => {
  await ensureSchools();
  const result = await registerParent({
    phone: PHONES[0]!,
    schoolId: SCHOOL_A,
    displayName: "Multi School Parent",
  });
  await registerParent({
    phone: PHONES[0]!,
    schoolId: SCHOOL_B,
    displayName: "Multi School Parent",
  });

  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: PHONES[0], password: "123456" }),
  });
  const loginBody = (await login.json()) as {
    data: { context_token: string };
  };
  expect(login.status).toBe(200);
  expect(typeof loginBody.data.context_token).toBe("string");

  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, result.user.id),
        eq(schoolMemberships.schoolId, SCHOOL_B),
      ),
    );
  const contextClaims = await verifyAccessToken(loginBody.data.context_token);
  expect(contextClaims).toMatchObject({
    sub: result.user.id,
    role: "context_selection",
    scope: "context_selection",
  });

  const selected = await app.request("/api/v1/auth/select-context", {
    method: "POST",
    headers: {
      authorization: `Bearer ${loginBody.data.context_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ membership_id: membership?.id }),
  });
  expect(selected.status).toBe(200);
  const selectedBody = (await selected.json()) as {
    data: { token: string };
  };
  const selectedClaims = await verifyAccessToken(selectedBody.data.token);
  expect(selectedClaims).toMatchObject({
    sub: result.user.id,
    school_id: SCHOOL_B,
    membership_id: membership?.id,
    role: "parent",
  });
});

test("suspended school revokes tenant access", async () => {
  await ensureSchools();
  const result = await registerParent({
    phone: PHONES[1]!,
    schoolId: SCHOOL_A,
    displayName: "Suspended School User",
  });
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(eq(schoolMemberships.userId, result.user.id));

  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: PHONES[1], password: "123456" }),
  });
  const token = ((await login.json()) as { data: { token: string } }).data
    .token;
  await db
    .update(schools)
    .set({ status: "suspended" })
    .where(eq(schools.id, SCHOOL_A));

  const response = await app.request("/api/v1/school/dashboard/stats", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: "UNAUTHORIZED", message: "Session expired or revoked" },
  });
});

test("auth endpoints return validation errors for malformed JSON", async () => {
  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  expect(login.status).toBe(400);

  const adminLogin = await app.request("/api/v1/auth/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  expect(adminLogin.status).toBe(400);
});
