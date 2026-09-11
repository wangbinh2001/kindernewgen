import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  feeSchedules,
  payments,
  schoolMemberships,
  schools,
  studentBalances,
  studentReductions,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

const period = "2026-09-01";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-tuition-a-${id}`,
    schoolB: `test-tuition-b-${id}`,
    adminA: `0921${digits}`,
    adminB: `0922${digits}`,
    studentA: crypto.randomUUID(),
    studentB: crypto.randomUUID(),
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

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);
  for (const [phone, schoolId] of [
    [s.adminA, s.schoolA],
    [s.adminB, s.schoolB],
  ] as const) {
    await registerParent({ phone, schoolId, displayName: "School Admin" });
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
  }
  await withTenant(s.schoolA, (tx) =>
    tx
      .insert(students)
      .values({ id: s.studentA, schoolId: s.schoolA, fullName: "Student A" }),
  );
  await withTenant(s.schoolB, (tx) =>
    tx
      .insert(students)
      .values({ id: s.studentB, schoolId: s.schoolB, fullName: "Student B" }),
  );
  return { tokenA: await login(s.adminA), tokenB: await login(s.adminB) };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      await tx.delete(payments).where(eq(payments.schoolId, schoolId));
      await tx
        .delete(studentBalances)
        .where(eq(studentBalances.schoolId, schoolId));
      await tx
        .delete(studentReductions)
        .where(eq(studentReductions.schoolId, schoolId));
      await tx.delete(feeSchedules).where(eq(feeSchedules.schoolId, schoolId));
      await tx.delete(students).where(eq(students.schoolId, schoolId));
    });
  }
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.adminA, s.adminB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("school admin can CRUD fee schedules and cannot see another tenant", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const headers = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };
    const created = await app.request("/api/v1/school/fees", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Monthly tuition",
        amount: 1000000,
        type: "basic",
      }),
    });
    expect(created.status).toBe(201);
    const feeId = ((await created.json()) as { data: { id: string } }).data.id;
    const updated = await app.request(`/api/v1/school/fees/${feeId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ amount: 1200000 }),
    });
    expect(updated.status).toBe(200);
    const other = await app.request("/api/v1/school/fees", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(other.status).toBe(200);
    expect(((await other.json()) as { data: unknown[] }).data).toHaveLength(0);
    const deleted = await app.request(`/api/v1/school/fees/${feeId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deleted.status).toBe(200);
    const [inactive] = await withTenant(s.schoolA, (tx) =>
      tx.select().from(feeSchedules).where(eq(feeSchedules.id, feeId)),
    );
    expect(inactive?.status).toBe("inactive");
  } finally {
    await cleanup(s);
  }
});

test("student reduction upserts percentage and fixed values", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const headers = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };
    const first = await app.request(
      `/api/v1/school/students/${s.studentA}/reduction`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          reductionType: "percentage",
          reductionValue: 20,
          note: "Sibling",
        }),
      },
    );
    expect(first.status).toBe(200);
    const second = await app.request(
      `/api/v1/school/students/${s.studentA}/reduction`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ reductionType: "fixed", reductionValue: 50000 }),
      },
    );
    expect(second.status).toBe(200);
    const current = await app.request(
      `/api/v1/school/students/${s.studentA}/reduction`,
      {
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(current.status).toBe(200);
    expect(
      (
        (await current.json()) as {
          data: { reductionType: string; reductionValue: number };
        }
      ).data,
    ).toMatchObject({
      reductionType: "fixed",
      reductionValue: 50000,
    });
    const crossTenant = await app.request(
      `/api/v1/school/students/${s.studentA}/reduction`,
      {
        headers: { authorization: `Bearer ${tokenB}` },
      },
    );
    expect(crossTenant.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});

test("payment ledger creates and updates balance using the due formula", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const headers = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };
    const first = await app.request("/api/v1/school/tuition/payments", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: s.studentA,
        amount: 200000,
        method: "transfer",
        period,
      }),
    });
    expect(first.status).toBe(201);
    expect(
      (
        (await first.json()) as {
          data: { payments: number; closingAmount: number };
        }
      ).data,
    ).toMatchObject({
      payments: 200000,
      closingAmount: -200000,
    });
    const second = await app.request("/api/v1/school/tuition/payments", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: s.studentA,
        amount: 50000,
        method: "cash",
        period,
      }),
    });
    expect(second.status).toBe(201);
    const balance = (
      (await second.json()) as {
        data: { payments: number; closingAmount: number };
      }
    ).data;
    expect(balance.payments).toBe(250000);
    expect(balance.closingAmount).toBe(-250000);
    await withTenant(s.schoolA, (tx) =>
      tx
        .update(studentBalances)
        .set({
          openingAmount: 100000,
          charges: 900000,
          adjustments: -50000,
          closingAmount: 700000,
        })
        .where(
          and(
            eq(studentBalances.studentId, s.studentA),
            eq(studentBalances.period, period),
          ),
        ),
    );
    const third = await app.request("/api/v1/school/tuition/payments", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: s.studentA,
        amount: 50000,
        method: "other",
        period,
      }),
    });
    expect(third.status).toBe(201);
    expect(
      (
        (await third.json()) as {
          data: { payments: number; closingAmount: number };
        }
      ).data,
    ).toMatchObject({
      payments: 300000,
      closingAmount: 650000,
    });
    const rows = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(studentBalances)
        .where(
          and(
            eq(studentBalances.studentId, s.studentA),
            eq(studentBalances.period, period),
          ),
        ),
    );
    expect(rows).toHaveLength(1);
    const crossTenant = await app.request("/api/v1/school/tuition/payments", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenB}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        studentId: s.studentA,
        amount: 1,
        method: "other",
        period,
      }),
    });
    expect(crossTenant.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
