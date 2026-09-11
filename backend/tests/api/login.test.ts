import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "../../src/auth/jwt";
import { registerParent } from "../../src/auth/register";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";
import { app } from "../../src/server";

const SCHOOL_A = "test-school-login-a";
const SCHOOL_B = "test-school-login-b";
const TEST_PHONES = ["0911000301", "0911000302", "0911000303", "0911000304"];

type LoginResponse = {
  success: boolean;
  data: {
    token?: string;
    memberships?: Array<{ id: string; school_id: string; role: string }>;
  };
  error: { code: string; message: string } | null;
};

async function ensureSchools() {
  await db
    .insert(schools)
    .values([
      { id: SCHOOL_A, name: "Test School Login A" },
      { id: SCHOOL_B, name: "Test School Login B" },
    ])
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

afterEach(async () => {
  await Promise.all(TEST_PHONES.map((phone) => cleanup(phone)));
});

test("login returns a JWT for one active school membership", async () => {
  await ensureSchools();
  const result = await registerParent({
    phone: "0911000301",
    schoolId: SCHOOL_A,
    displayName: "Login One School",
  });

  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "0911000301", password: "123456" }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as LoginResponse;
  expect(body.success).toBe(true);
  expect(typeof body.data.token).toBe("string");
  expect(body.error).toBeNull();

  const memberships = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, result.user.id));
  const tokenClaims = await verifyAccessToken(body.data.token!);
  expect(tokenClaims).toMatchObject({
    sub: result.user.id,
    membership_id: memberships[0]?.id,
    school_id: SCHOOL_A,
    role: "parent",
    session_version: 1,
  });
});

test("login returns memberships without a JWT for multiple schools", async () => {
  await ensureSchools();
  await registerParent({
    phone: "0911000302",
    schoolId: SCHOOL_A,
    displayName: "Login Multi School",
  });
  await registerParent({
    phone: "0911000302",
    schoolId: SCHOOL_B,
    displayName: "Login Multi School",
  });

  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "0911000302", password: "123456" }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as LoginResponse;
  expect(body.success).toBe(true);
  expect(body.error).toBeNull();
  expect(body.data.token).toBeUndefined();
  expect(body.data.memberships).toHaveLength(2);
  expect(body.data.memberships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ school_id: SCHOOL_A, role: "parent" }),
      expect.objectContaining({ school_id: SCHOOL_B, role: "parent" }),
    ]),
  );
});

test("login rejects a wrong password with UNAUTHORIZED", async () => {
  await ensureSchools();
  await registerParent({
    phone: "0911000303",
    schoolId: SCHOOL_A,
    displayName: "Login Wrong Password",
  });

  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "0911000303", password: "wrong" }),
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    success: false,
    data: null,
    error: { code: "UNAUTHORIZED" },
  });
});

test("login rejects an unknown phone with UNAUTHORIZED", async () => {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: "0911000304", password: "123456" }),
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    success: false,
    data: null,
    error: { code: "UNAUTHORIZED" },
  });
});
