import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-recovery-a-${id}`,
    schoolB: `test-recovery-b-${id}`,
    adminA: `0971${digits}`,
    adminB: `0982${digits}`,
    parentA: `0993${digits}`,
    parentB: `0904${digits}`,
  };
}

async function login(phone: string, password = "123456") {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  return response;
}

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);
  for (const [phone, schoolId] of [
    [s.adminA, s.schoolA],
    [s.adminB, s.schoolB],
    [s.parentB, s.schoolB],
  ] as const) {
    await registerParent({ phone, schoolId, displayName: "Account User" });
  }
  const [adminA] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, s.adminA));
  const [adminB] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, s.adminB));
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(
      and(
        eq(schoolMemberships.userId, adminA!.id),
        eq(schoolMemberships.schoolId, s.schoolA),
      ),
    );
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(
      and(
        eq(schoolMemberships.userId, adminB!.id),
        eq(schoolMemberships.schoolId, s.schoolB),
      ),
    );
  await registerParent({
    phone: s.parentA,
    schoolId: s.schoolA,
    displayName: "Parent A",
  });
  const adminLogin = await login(s.adminA);
  const adminBody = (await adminLogin.json()) as { data: { token: string } };
  const parentLogin = await login(s.parentA);
  const parentBody = (await parentLogin.json()) as { data: { token: string } };
  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, s.parentA));
  const [otherParent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.globalPhone, s.parentB));
  return {
    adminToken: adminBody.data.token,
    oldParentToken: parentBody.data.token,
    parentId: parent!.id,
    otherParentId: otherParent!.id,
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(
      inArray(users.globalPhone, [s.adminA, s.adminB, s.parentA, s.parentB]),
    );
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("school admin can issue a one-time temporary password and revoke old sessions", async () => {
  const s = scenario();
  try {
    const setupData = await setup(s);
    const response = await app.request(
      `/api/v1/school/users/${setupData.parentId}/reset-password`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${setupData.adminToken}` },
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { temporaryPassword: string; mustChangePassword: boolean };
    };
    expect(body.data.temporaryPassword).toHaveLength(12);
    expect(body.data.mustChangePassword).toBe(true);

    const oldPassword = await login(s.parentA);
    expect(oldPassword.status).toBe(401);
    const newPassword = await login(s.parentA, body.data.temporaryPassword);
    expect(newPassword.status).toBe(200);
    const newToken = ((await newPassword.json()) as { data: { token: string } })
      .data.token;
    const changed = await app.request("/api/v1/auth/change-password", {
      method: "POST",
      headers: {
        authorization: `Bearer ${newToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: body.data.temporaryPassword,
        newPassword: "Parent#123",
      }),
    });
    expect(changed.status).toBe(200);
    expect((await login(s.parentA, body.data.temporaryPassword)).status).toBe(
      401,
    );
    expect((await login(s.parentA, "Parent#123")).status).toBe(200);

    const revoked = await app.request("/api/v1/parent/children", {
      headers: { authorization: `Bearer ${setupData.oldParentToken}` },
    });
    expect(revoked.status).toBe(401);
    const [updated] = await db
      .select({ mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, setupData.parentId));
    expect(updated?.mustChangePassword).toBe(false);
  } finally {
    await cleanup(s);
  }
});

test("school admin cannot reset an account from another school", async () => {
  const s = scenario();
  try {
    const setupData = await setup(s);
    const response = await app.request(
      `/api/v1/school/users/${setupData.otherParentId}/reset-password`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${setupData.adminToken}` },
      },
    );
    expect(response.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
