import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolId: `test-logout-${id}`,
    phone: `0991${digits}`,
  };
}

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values({ id: s.schoolId, name: s.schoolId });
  await registerParent({
    phone: s.phone,
    schoolId: s.schoolId,
    displayName: "Logout Admin",
  });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.phone));
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, s.schoolId),
      ),
    );
}

async function login(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { token: string } }).data.token;
}

async function cleanup(s: ReturnType<typeof scenario>) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, s.phone));
  if (user) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(eq(schools.id, s.schoolId));
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

test("logout returns the standard success envelope", async () => {
  const s = scenario();
  try {
    await setup(s);
    const token = await login(s.phone);
    const response = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: bearer(token),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { message: "Đăng xuất thành công" },
      error: null,
    });
  } finally {
    await cleanup(s);
  }
});

test("logout-all revokes every token with the old session version", async () => {
  const s = scenario();
  try {
    await setup(s);
    const firstToken = await login(s.phone);
    const secondToken = await login(s.phone);
    const logoutAll = await app.request("/api/v1/auth/logout-all", {
      method: "POST",
      headers: bearer(firstToken),
    });
    expect(logoutAll.status).toBe(200);

    for (const token of [firstToken, secondToken]) {
      const response = await app.request("/api/v1/school/dashboard/stats", {
        headers: bearer(token),
      });
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toBe("Session expired or revoked");
    }
  } finally {
    await cleanup(s);
  }
});

test("login after logout-all returns a new session version that works", async () => {
  const s = scenario();
  try {
    await setup(s);
    const oldToken = await login(s.phone);
    const logoutAll = await app.request("/api/v1/auth/logout-all", {
      method: "POST",
      headers: bearer(oldToken),
    });
    expect(logoutAll.status).toBe(200);

    const newToken = await login(s.phone);
    expect(newToken).not.toBe(oldToken);
    const response = await app.request("/api/v1/school/dashboard/stats", {
      headers: bearer(newToken),
    });
    expect(response.status).toBe(200);
  } finally {
    await cleanup(s);
  }
});
