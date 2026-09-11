import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/server";
import { createAccessToken } from "../../src/auth/jwt";
import { db } from "../../src/db";
import { withTenant } from "../../src/db/tenant";
import {
  payments,
  schoolMemberships,
  schools,
  studentBalances,
  students,
  tuitionHistory,
  tuitionItems,
  users,
} from "../../src/db/schema";

const id = crypto.randomUUID();
const schoolA = `test-tuition-history-a-${id}`;
const schoolB = `test-tuition-history-b-${id}`;
const phone = `091${id.replaceAll("-", "").slice(0, 7)}`;
let userId = "";
let membershipId = "";
let studentId = "";
let historyId = "";
let paymentId = "";

async function setup() {
  await db.insert(schools).values([
    { id: schoolA, name: `Tuition History A ${id}` },
    { id: schoolB, name: `Tuition History B ${id}` },
  ]);
  userId = crypto.randomUUID();
  membershipId = crypto.randomUUID();
  studentId = crypto.randomUUID();
  historyId = crypto.randomUUID();
  paymentId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    globalPhone: phone,
    passwordHash: "hash",
    displayName: "Tuition Admin",
  });
  await db.insert(schoolMemberships).values({
    id: membershipId,
    userId,
    schoolId: schoolA,
    role: "school_admin",
  });
  await withTenant(schoolA, async (tx) => {
    await tx.insert(students).values({
      id: studentId,
      schoolId: schoolA,
      fullName: "Tuition Student",
    });
    await tx.insert(tuitionHistory).values({
      id: historyId,
      schoolId: schoolA,
      studentId,
      month: "2026-09-01",
      feeSnapshot: { basic: 1000 },
      reductionType: null,
      reductionValue: null,
      totalFees: 1000,
      totalReduction: 0,
      finalAmount: 1000,
      state: "confirmed",
      confirmedBy: membershipId,
      confirmedAt: new Date(),
    });
    await tx.insert(tuitionItems).values({
      id: crypto.randomUUID(),
      tuitionHistoryId: historyId,
      feeType: "basic",
      description: "Basic tuition",
      amount: 1000,
    });
    await tx.insert(studentBalances).values({
      id: crypto.randomUUID(),
      schoolId: schoolA,
      studentId,
      period: "2026-09-01",
      openingAmount: 0,
      charges: 1000,
      payments: 300,
      adjustments: 0,
      closingAmount: 700,
    });
    await tx.insert(payments).values({
      id: paymentId,
      schoolId: schoolA,
      studentId,
      amount: 300,
      method: "transfer",
      receivedBy: membershipId,
    });
  });
  return createAccessToken({
    sub: userId,
    membership_id: membershipId,
    school_id: schoolA,
    role: "school_admin",
    session_version: 1,
  });
}

afterEach(async () => {
  if (studentId) {
    await withTenant(schoolA, async (tx) => {
      await tx.delete(payments).where(eq(payments.studentId, studentId));
      await tx
        .delete(studentBalances)
        .where(eq(studentBalances.studentId, studentId));
      await tx
        .delete(tuitionItems)
        .where(eq(tuitionItems.tuitionHistoryId, historyId));
      await tx.delete(tuitionHistory).where(eq(tuitionHistory.id, historyId));
      await tx.delete(students).where(eq(students.id, studentId));
    });
  }
  if (membershipId)
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.id, membershipId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await db.delete(schools).where(eq(schools.id, schoolA));
  await db.delete(schools).where(eq(schools.id, schoolB));
});

test("school admin can read tuition history, detail, payments, and receipt", async () => {
  const token = await setup();
  const headers = { authorization: `Bearer ${token}` };
  const list = await app.request(
    "/api/v1/school/tuition/history?month=2026-09-01&studentId=" + studentId,
    { headers },
  );
  expect(list.status).toBe(200);
  const listBody = (await list.json()) as { data: { items: unknown[] } };
  expect(listBody.data.items).toHaveLength(1);

  const detail = await app.request(
    `/api/v1/school/tuition/history/${historyId}`,
    { headers },
  );
  expect(detail.status).toBe(200);
  const detailBody = (await detail.json()) as {
    data: { items: Array<{ amount: number }> };
  };
  expect(detailBody.data.items[0]?.amount).toBe(1000);

  const paymentList = await app.request(
    `/api/v1/school/tuition/payments?studentId=${studentId}&period=2026-09-01`,
    { headers },
  );
  expect(paymentList.status).toBe(200);
  const paymentBody = (await paymentList.json()) as {
    data: { items: unknown[] };
  };
  expect(paymentBody.data.items).toHaveLength(1);

  const receipt = await app.request(
    `/api/v1/school/tuition/payments/${paymentId}/receipt`,
    { headers },
  );
  expect(receipt.status).toBe(200);
  const receiptBody = (await receipt.json()) as {
    data: { payment: { amount: number } };
  };
  expect(receiptBody.data.payment.amount).toBe(300);
});

test("tuition history APIs return not found for an unknown record", async () => {
  const token = await setup();
  const response = await app.request(
    `/api/v1/school/tuition/history/${crypto.randomUUID()}`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  expect(response.status).toBe(404);
});
