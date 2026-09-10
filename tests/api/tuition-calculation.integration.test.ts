import { expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  attendance,
  attendanceOptionalFees,
  classStudents,
  classes,
  feeSchedules,
  optionalFees,
  schoolMemberships,
  schoolYears,
  schools,
  studentBalances,
  studentReductions,
  students,
  tuitionAdjustments,
  tuitionHistory,
  tuitionItems,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

const month = "2026-09-01";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-calc-a-${id}`,
    schoolB: `test-calc-b-${id}`,
    adminA: `0931${digits}`,
    adminB: `0932${digits}`,
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

  const fixture = await withTenant(s.schoolA, async (tx) => {
    const yearId = crypto.randomUUID();
    const classId = crypto.randomUUID();
    const optionalFeeId = crypto.randomUUID();
    const attendanceId = crypto.randomUUID();
    await tx.insert(schoolYears).values({
      id: yearId,
      schoolId: s.schoolA,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "active",
    });
    await tx.insert(classes).values({
      id: classId,
      schoolId: s.schoolA,
      schoolYearId: yearId,
      name: "Sunflower",
      status: "active",
    });
    await tx.insert(students).values({
      id: s.studentA,
      schoolId: s.schoolA,
      fullName: "Student A",
    });
    await tx.insert(classStudents).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      classId,
      studentId: s.studentA,
      schoolYearId: yearId,
    });
    await tx.insert(feeSchedules).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        name: "Basic tuition",
        amount: 1000000,
        type: "basic",
        cycle: "monthly",
        status: "active",
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        name: "Meal tuition",
        amount: 200000,
        type: "meal",
        classId,
        cycle: "monthly",
        status: "active",
      },
    ]);
    await tx.insert(optionalFees).values({
      id: optionalFeeId,
      schoolId: s.schoolA,
      name: "Breakfast",
      amount: 30000,
      status: "active",
    });
    await tx.insert(attendance).values({
      id: attendanceId,
      schoolId: s.schoolA,
      studentId: s.studentA,
      classId,
      date: "2026-09-10",
      status: "present",
      state: "confirmed",
    });
    await tx.insert(attendanceOptionalFees).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      attendanceId,
      optionalFeeId,
      feeSnapshotAmount: 30000,
    });
    await tx.insert(studentReductions).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      studentId: s.studentA,
      reductionType: "percentage",
      reductionValue: 10,
      status: "active",
    });
    await tx.insert(studentBalances).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      studentId: s.studentA,
      period: "2026-08-01",
      openingAmount: 0,
      charges: 0,
      payments: 0,
      adjustments: 0,
      closingAmount: 150000,
    });
    return { classId };
  });
  await withTenant(s.schoolB, (tx) =>
    tx.insert(students).values({
      id: s.studentB,
      schoolId: s.schoolB,
      fullName: "Student B",
    }),
  );
  return {
    ...fixture,
    tokenA: await login(s.adminA),
    tokenB: await login(s.adminB),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      const histories = await tx
        .select({ id: tuitionHistory.id })
        .from(tuitionHistory)
        .where(eq(tuitionHistory.schoolId, schoolId));
      if (histories.length) {
        await tx.delete(tuitionItems).where(
          inArray(
            tuitionItems.tuitionHistoryId,
            histories.map((row) => row.id),
          ),
        );
      }
      await tx
        .delete(tuitionAdjustments)
        .where(eq(tuitionAdjustments.schoolId, schoolId));
      await tx
        .delete(tuitionHistory)
        .where(eq(tuitionHistory.schoolId, schoolId));
      await tx
        .delete(studentBalances)
        .where(eq(studentBalances.schoolId, schoolId));
      await tx
        .delete(attendanceOptionalFees)
        .where(eq(attendanceOptionalFees.schoolId, schoolId));
      await tx.delete(attendance).where(eq(attendance.schoolId, schoolId));
      await tx
        .delete(studentReductions)
        .where(eq(studentReductions.schoolId, schoolId));
      await tx.delete(optionalFees).where(eq(optionalFees.schoolId, schoolId));
      await tx.delete(feeSchedules).where(eq(feeSchedules.schoolId, schoolId));
      await tx
        .delete(classStudents)
        .where(eq(classStudents.schoolId, schoolId));
      await tx.delete(students).where(eq(students.schoolId, schoolId));
      await tx.delete(classes).where(eq(classes.schoolId, schoolId));
      await tx.delete(schoolYears).where(eq(schoolYears.schoolId, schoolId));
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

async function calculate(token: string, studentId: string, classId?: string) {
  const response = await app.request("/api/v1/school/tuition/calculate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ month, studentId, classId }),
  });
  expect(response.status).toBe(200);
  const data = (
    (await response.json()) as { data: Array<Record<string, unknown>> }
  ).data;
  return { response, record: data[0]! };
}

async function confirm(token: string, record: Record<string, unknown>) {
  return app.request("/api/v1/school/tuition/confirm", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ month, records: [record] }),
  });
}

test("calculate returns fee, optional fee, reduction, and previous balance math", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const { record } = await calculate(
      fixture.tokenA,
      s.studentA,
      fixture.classId,
    );
    expect(record).toMatchObject({
      studentId: s.studentA,
      totalFees: 1230000,
      totalReduction: 123000,
      finalAmount: 1107000,
      previousBalance: 150000,
      reductionType: "percentage",
      reductionValue: 10,
    });
    const crossTenant = await app.request("/api/v1/school/tuition/calculate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.tokenB}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ month, studentId: s.studentA }),
    });
    expect(crossTenant.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});

test("confirm persists tuition history/items, updates balance, and blocks duplicate confirm", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const { record } = await calculate(
      fixture.tokenA,
      s.studentA,
      fixture.classId,
    );
    const created = await confirm(fixture.tokenA, record);
    expect(created.status).toBe(201);
    const [history] = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(tuitionHistory)
        .where(eq(tuitionHistory.studentId, s.studentA)),
    );
    expect(history?.state).toBe("confirmed");
    const items = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(tuitionItems)
        .where(eq(tuitionItems.tuitionHistoryId, history!.id)),
    );
    expect(items.length).toBeGreaterThan(0);
    const [balance] = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(studentBalances)
        .where(
          and(
            eq(studentBalances.studentId, s.studentA),
            eq(studentBalances.period, month),
          ),
        ),
    );
    expect(balance).toMatchObject({
      openingAmount: 150000,
      charges: 1107000,
      closingAmount: 1257000,
    });
    expect((await confirm(fixture.tokenA, record)).status).toBe(400);
  } finally {
    await cleanup(s);
  }
});

test("adjustment records amount and recalculates the confirmed month's balance", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const { record } = await calculate(
      fixture.tokenA,
      s.studentA,
      fixture.classId,
    );
    expect((await confirm(fixture.tokenA, record)).status).toBe(201);
    const [history] = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(tuitionHistory)
        .where(eq(tuitionHistory.studentId, s.studentA)),
    );
    const crossTenant = await app.request(
      `/api/v1/school/tuition/history/${history!.id}/adjust`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.tokenB}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ amount: -50000, reason: "Other school" }),
      },
    );
    expect(crossTenant.status).toBe(404);
    const adjusted = await app.request(
      `/api/v1/school/tuition/history/${history!.id}/adjust`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: -50000,
          reason: "Scholarship correction",
        }),
      },
    );
    expect(adjusted.status).toBe(200);
    const [balance] = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(studentBalances)
        .where(
          and(
            eq(studentBalances.studentId, s.studentA),
            eq(studentBalances.period, month),
          ),
        ),
    );
    expect(balance).toMatchObject({
      adjustments: -50000,
      closingAmount: 1207000,
    });
    const adjustments = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(tuitionAdjustments)
        .where(eq(tuitionAdjustments.tuitionHistoryId, history!.id)),
    );
    expect(adjustments).toHaveLength(1);
  } finally {
    await cleanup(s);
  }
});
