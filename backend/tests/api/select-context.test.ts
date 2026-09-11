import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../../src/auth/jwt";
import { registerParent } from "../../src/auth/register";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";
import { app } from "../../src/server";

const SCHOOL_ID = "test-school-select-context";
const TEST_PHONES = ["0911000311", "0911000312", "0911000313"];

type SelectContextResponse = {
  success: boolean;
  data: { token?: string };
  error: { code: string; message: string } | null;
};

type LoginResponse = {
  data: { token?: string };
};

async function ensureSchool() {
  await db
    .insert(schools)
    .values({ id: SCHOOL_ID, name: "Test School Select Context" })
    .onConflictDoNothing();
}

async function cleanup(phone: string) {
  const found = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, phone));

  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
}

async function loginToken(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as LoginResponse;
  expect(typeof body.data.token).toBe("string");
  return body.data.token!;
}

afterEach(async () => {
  await Promise.all(TEST_PHONES.map((phone) => cleanup(phone)));
  await db.delete(schools).where(eq(schools.id, SCHOOL_ID));
});

test("select-context returns a JWT for a membership owned by the user", async () => {
  await ensureSchool();
  const result = await registerParent({
    phone: "0911000311",
    schoolId: SCHOOL_ID,
    displayName: "Select Context User",
  });
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, result.user.id));
  const token = await loginToken("0911000311");

  const response = await app.request("/api/v1/auth/select-context", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      userId: result.user.id,
      membership_id: membership?.id,
    }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as SelectContextResponse;
  expect(body.success).toBe(true);
  expect(typeof body.data.token).toBe("string");
  expect(body.error).toBeNull();

  const claims = await verifyAccessToken(body.data.token!);
  expect(claims).toMatchObject({
    sub: result.user.id,
    membership_id: membership?.id,
    school_id: SCHOOL_ID,
    role: "parent",
    session_version: 1,
  });
});

test("select-context rejects a membership that belongs to another user", async () => {
  await ensureSchool();
  const first = await registerParent({
    phone: "0911000311",
    schoolId: SCHOOL_ID,
    displayName: "First Select Context User",
  });
  const second = await registerParent({
    phone: "0911000312",
    schoolId: SCHOOL_ID,
    displayName: "Second Select Context User",
  });
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, second.user.id));
  const token = await loginToken("0911000311");

  const response = await app.request("/api/v1/auth/select-context", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      userId: first.user.id,
      membership_id: membership?.id,
    }),
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    success: false,
    data: null,
    error: { code: "NOT_FOUND" },
  });
});

test("select-context rejects request without bearer token", async () => {
  await ensureSchool();
  const result = await registerParent({
    phone: "0911000313",
    schoolId: SCHOOL_ID,
    displayName: "Select Context No Token",
  });
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, result.user.id));

  const response = await app.request("/api/v1/auth/select-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: result.user.id,
      membership_id: membership?.id,
    }),
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    success: false,
    data: null,
    error: { code: "UNAUTHORIZED" },
  });
});

test("select-context rejects token whose sub differs from userId", async () => {
  await ensureSchool();
  const first = await registerParent({
    phone: "0911000311",
    schoolId: SCHOOL_ID,
    displayName: "Select Context Token Owner",
  });
  const second = await registerParent({
    phone: "0911000312",
    schoolId: SCHOOL_ID,
    displayName: "Select Context Body User",
  });
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, second.user.id));
  const token = await loginToken("0911000311");

  const response = await app.request("/api/v1/auth/select-context", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      userId: second.user.id,
      membership_id: membership?.id,
    }),
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    success: false,
    data: null,
    error: { code: "NOT_FOUND" },
  });
});
