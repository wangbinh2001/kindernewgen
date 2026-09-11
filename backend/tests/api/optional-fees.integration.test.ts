import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  optionalFees,
  schoolMemberships,
  schools,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-fees-a-${id}`,
    schoolB: `test-fees-b-${id}`,
    adminA: `0901${digits}`,
    adminB: `0902${digits}`,
    teacherA: `0903${digits}`,
  };
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

async function member(phone: string, schoolId: string, role: string) {
  await registerParent({ phone, schoolId, displayName: role });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, phone));
  await db
    .update(schoolMemberships)
    .set({ role })
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, schoolId),
      ),
    );
}

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);
  await member(s.adminA, s.schoolA, "school_admin");
  await member(s.adminB, s.schoolB, "school_admin");
  await member(s.teacherA, s.schoolA, "teacher");
  return {
    tokenA: await login(s.adminA),
    tokenB: await login(s.adminB),
    teacherToken: await login(s.teacherA),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, (tx) =>
      tx.delete(optionalFees).where(eq(optionalFees.schoolId, schoolId)),
    );
  }
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.adminA, s.adminB, s.teacherA]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("school admin can CRUD optional fees and teacher can only read", async () => {
  const s = scenario();
  try {
    const { tokenA, teacherToken } = await setup(s);
    const headers = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };
    const created = await app.request("/api/v1/school/optional-fees", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Breakfast", amount: 25000 }),
    });
    expect(created.status).toBe(201);
    const feeId = ((await created.json()) as { data: { id: string } }).data.id;
    const listed = await app.request("/api/v1/school/optional-fees", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { data: Array<{ id: string }> }).data.some(
        (fee) => fee.id === feeId,
      ),
    ).toBe(true);
    const updated = await app.request(`/api/v1/school/optional-fees/${feeId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "Breakfast", amount: 30000 }),
    });
    expect(updated.status).toBe(200);
    const teacherList = await app.request("/api/v1/school/optional-fees", {
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(teacherList.status).toBe(200);
    const teacherWrite = await app.request("/api/v1/school/optional-fees", {
      method: "POST",
      headers: {
        authorization: `Bearer ${teacherToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Lunch", amount: 30000 }),
    });
    expect(teacherWrite.status).toBe(403);
    const deleted = await app.request(`/api/v1/school/optional-fees/${feeId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deleted.status).toBe(200);
    const [inactive] = await withTenant(s.schoolA, (tx) =>
      tx.select().from(optionalFees).where(eq(optionalFees.id, feeId)),
    );
    expect(inactive?.status).toBe("inactive");
  } finally {
    await cleanup(s);
  }
});

test("optional fees are isolated across tenants", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const created = await app.request("/api/v1/school/optional-fees", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Only A", amount: 1000 }),
    });
    expect(created.status).toBe(201);
    const other = await app.request("/api/v1/school/optional-fees", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(other.status).toBe(200);
    expect(((await other.json()) as { data: unknown[] }).data).toHaveLength(0);
  } finally {
    await cleanup(s);
  }
});
