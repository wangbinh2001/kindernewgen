import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  attendance,
  classes,
  classStudents,
  grocerySheets,
  reportJobs,
  schoolMemberships,
  schools,
  schoolYears,
  students,
  tuitionHistory,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { createAccessToken } from "../../src/auth/jwt";

test("background report jobs generate tuition, attendance, and nutrition reports asynchronously", async () => {
  const suffix = crypto.randomUUID();
  const schoolId = `school-rep-${suffix}`;
  const phone = `0977${suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;

  await db.insert(schools).values({ id: schoolId, name: `School Report ${suffix}` });

  const [adminUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      globalPhone: phone,
      passwordHash: "hash",
      status: "active",
      displayName: "Admin Report",
    })
    .returning();

  const [membership] = await db
    .insert(schoolMemberships)
    .values({
      id: crypto.randomUUID(),
      schoolId,
      userId: adminUser!.id,
      role: "school_admin",
    })
    .returning();

  const token = await createAccessToken({
    sub: adminUser!.id,
    school_id: schoolId,
    membership_id: membership!.id,
    role: "school_admin",
    session_version: 1,
  });

  const studentId = crypto.randomUUID();
  const classId = `class-${suffix}`;
  const schoolYearId = `sy-${suffix}`;

  await withTenant(schoolId, async (tx) => {
    await tx.insert(students).values({
      id: studentId,
      schoolId,
      fullName: "Học sinh Báo Cáo",
      status: "active",
      dob: "2020-01-01",
      gender: "female",
    });

    await tx.insert(schoolYears).values({
      id: schoolYearId,
      schoolId,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-05-31",
    });

    await tx.insert(classes).values({
      id: classId,
      schoolId,
      schoolYearId,
      name: "Lớp Báo Cáo",
    });

    await tx.insert(classStudents).values({
      id: crypto.randomUUID(),
      schoolId,
      classId,
      studentId,
      schoolYearId,
    });

    // 1. Dữ liệu học phí
    await tx.insert(tuitionHistory).values({
      id: crypto.randomUUID(),
      schoolId,
      studentId,
      month: "2026-09-01",
      feeSnapshot: [],
      totalFees: 2000000,
      totalReduction: 200000,
      finalAmount: 1800000,
      state: "confirmed",
    });

    // 2. Dữ liệu điểm danh
    await tx.insert(attendance).values({
      id: crypto.randomUUID(),
      schoolId,
      studentId,
      classId,
      date: "2026-09-15",
      status: "present",
      checkInTime: "07:30",
      checkOutTime: "18:00",
      overtimeHours: "1.00",
      state: "draft",
    });

    // 3. Dữ liệu dinh dưỡng
    await tx.insert(grocerySheets).values({
      id: crypto.randomUUID(),
      schoolId,
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      totalStudents: 25,
      totalFoodCost: "1500000.00",
      electricityCost: "100000.00",
      gasCost: "50000.00",
      estimatedTotal: "1650000.00",
      status: "completed",
    });
  });

  // A. Trigger report học phí -> 202 Accepted
  const tuitionJobRes = await app.request("/api/v1/school/reports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "tuition",
      parameters: { month: "2026-09-01" },
    }),
  });

  expect(tuitionJobRes.status).toBe(202);
  const tuitionJobData = ((await tuitionJobRes.json()) as any).data;
  expect(tuitionJobData.id).toBeDefined();
  expect(tuitionJobData.status).toBe("pending");

  // B. Trigger report điểm danh
  const attJobRes = await app.request("/api/v1/school/reports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "attendance",
      parameters: { startDate: "2026-09-01", endDate: "2026-09-30" },
    }),
  });
  expect(attJobRes.status).toBe(202);
  const attJobData = ((await attJobRes.json()) as any).data;

  // C. Trigger report dinh dưỡng
  const nutJobRes = await app.request("/api/v1/school/reports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nutrition",
      parameters: {},
    }),
  });
  expect(nutJobRes.status).toBe(202);
  const nutJobData = ((await nutJobRes.json()) as any).data;

  // Chờ background jobs hoàn tất
  for (let i = 0; i < 20; i++) {
    const checkRes = await app.request(`/api/v1/school/reports/${tuitionJobData.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = ((await checkRes.json()) as any).data;
    if (body.status === "completed") break;
    await Bun.sleep(100);
  }

  const pollTuition = await app.request(`/api/v1/school/reports/${tuitionJobData.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const completedTuition = ((await pollTuition.json()) as any).data;
  expect(completedTuition.status).toBe("completed");
  expect(completedTuition.result.summary.totalFees).toBe(2000000);
  expect(completedTuition.result.summary.totalFinalAmount).toBe(1800000);

  for (let i = 0; i < 20; i++) {
    const checkRes = await app.request(`/api/v1/school/reports/${attJobData.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = ((await checkRes.json()) as any).data;
    if (body.status === "completed") break;
    await Bun.sleep(100);
  }

  const pollAtt = await app.request(`/api/v1/school/reports/${attJobData.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const completedAtt = ((await pollAtt.json()) as any).data;
  expect(completedAtt.status).toBe("completed");
  expect(completedAtt.result.summary.presentCount).toBe(1);
  expect(completedAtt.result.summary.totalOvertimeHours).toBe(1);

  for (let i = 0; i < 20; i++) {
    const checkRes = await app.request(`/api/v1/school/reports/${nutJobData.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = ((await checkRes.json()) as any).data;
    if (body.status === "completed") break;
    await Bun.sleep(100);
  }

  const pollNut = await app.request(`/api/v1/school/reports/${nutJobData.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const completedNut = ((await pollNut.json()) as any).data;
  expect(completedNut.status).toBe("completed");
  expect(completedNut.result.summary.totalGrocerySheets).toBe(1);
  expect(completedNut.result.summary.totalFoodCost).toBe(1500000);

  // D. Danh sách job reports
  const listRes = await app.request("/api/v1/school/reports", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(listRes.status).toBe(200);
  const listData = ((await listRes.json()) as any).data;
  expect(listData.length).toBeGreaterThanOrEqual(3);

  // Cleanup
  await withTenant(schoolId, async (tx) => {
    await tx.delete(grocerySheets).where(eq(grocerySheets.schoolId, schoolId));
    await tx.delete(attendance).where(eq(attendance.schoolId, schoolId));
    await tx.delete(tuitionHistory).where(eq(tuitionHistory.schoolId, schoolId));
    await tx.delete(classStudents).where(eq(classStudents.schoolId, schoolId));
    await tx.delete(classes).where(eq(classes.schoolId, schoolId));
    await tx.delete(schoolYears).where(eq(schoolYears.schoolId, schoolId));
    await tx.delete(students).where(eq(students.schoolId, schoolId));
  });
  await db.delete(reportJobs).where(eq(reportJobs.schoolId, schoolId));
  await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
  await db.delete(users).where(eq(users.id, adminUser!.id));
  await db.delete(schools).where(eq(schools.id, schoolId));
});
