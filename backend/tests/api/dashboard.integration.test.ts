import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  attendance,
  classStudents,
  classes,
  parentRequests,
  schoolMemberships,
  schoolYears,
  schools,
  studentBalances,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

const dashboardDate = "2026-09-11";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-dashboard-a-${id}`,
    schoolB: `test-dashboard-b-${id}`,
    adminA: `0981${digits}`,
    adminB: `0982${digits}`,
    teacherA: `0983${digits}`,
    staffA: `0984${digits}`,
    parentA: `0985${digits}`,
  };
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
  const [membership] = await db
    .select()
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, schoolId),
      ),
    );
  return { user: user!, membership: membership! };
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
  const adminA = await member(s.adminA, s.schoolA, "school_admin");
  await member(s.adminB, s.schoolB, "school_admin");
  await member(s.teacherA, s.schoolA, "teacher");
  await member(s.staffA, s.schoolA, "staff");
  const parentA = await member(s.parentA, s.schoolA, "parent");

  const data = await withTenant(s.schoolA, async (tx) => {
    const yearId = crypto.randomUUID();
    const classMarkedId = crypto.randomUUID();
    const classUnmarkedId = crypto.randomUUID();
    const archivedClassId = crypto.randomUUID();
    const studentPresentId = crypto.randomUUID();
    const studentAbsentId = crypto.randomUUID();
    const inactiveStudentId = crypto.randomUUID();
    const now = Date.now();
    await tx.insert(schoolYears).values({
      id: yearId,
      schoolId: s.schoolA,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "active",
    });
    await tx.insert(classes).values([
      {
        id: classMarkedId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Marked Class",
        status: "active",
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
      },
      {
        id: classUnmarkedId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Unmarked Class",
        status: "active",
        createdAt: new Date(now - 4 * 60 * 60 * 1000),
      },
      {
        id: archivedClassId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Archived Class",
        status: "archived",
        createdAt: new Date(now - 5 * 60 * 60 * 1000),
      },
    ]);
    await tx.insert(students).values([
      {
        id: studentPresentId,
        schoolId: s.schoolA,
        fullName: "Dashboard Present",
        status: "active",
        currentClassId: classMarkedId,
        createdAt: new Date(now - 1 * 60 * 60 * 1000),
      },
      {
        id: studentAbsentId,
        schoolId: s.schoolA,
        fullName: "Dashboard Absent",
        status: "active",
        currentClassId: classUnmarkedId,
        createdAt: new Date(now - 3 * 60 * 60 * 1000),
      },
      {
        id: inactiveStudentId,
        schoolId: s.schoolA,
        fullName: "Dashboard Inactive",
        status: "inactive",
        createdAt: new Date(now - 6 * 60 * 60 * 1000),
      },
    ]);
    await tx.insert(classStudents).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        classId: classMarkedId,
        studentId: studentPresentId,
        schoolYearId: yearId,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        classId: classUnmarkedId,
        studentId: studentAbsentId,
        schoolYearId: yearId,
      },
    ]);
    await tx.insert(attendance).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      studentId: studentPresentId,
      classId: classMarkedId,
      date: dashboardDate,
      status: "present",
      state: "confirmed",
    });
    await tx.insert(studentBalances).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        studentId: studentPresentId,
        period: "2026-09-01",
        openingAmount: 1000,
        charges: 500,
        payments: 300,
        adjustments: 0,
        closingAmount: 1200,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        studentId: studentAbsentId,
        period: "2026-09-01",
        openingAmount: 0,
        charges: 0,
        payments: 0,
        adjustments: 0,
        closingAmount: 0,
      },
    ]);
    await tx.insert(parentRequests).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        parentId: parentA.user.id,
        childId: studentPresentId,
        type: "medical",
        content: "Overdue request",
        status: "pending",
        createdAt: new Date(now - 25 * 60 * 60 * 1000),
        updatedAt: new Date(now - 25 * 60 * 60 * 1000),
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        parentId: parentA.user.id,
        childId: studentAbsentId,
        type: "absence",
        content: "Recent request",
        status: "pending",
        createdAt: new Date(now - 90 * 60 * 1000),
        updatedAt: new Date(now - 90 * 60 * 1000),
      },
    ]);
    return { classMarkedId, classUnmarkedId };
  });

  await withTenant(s.schoolB, async (tx) => {
    const yearId = crypto.randomUUID();
    await tx.insert(schoolYears).values({
      id: yearId,
      schoolId: s.schoolB,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "active",
    });
    await tx.insert(classes).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolB,
      schoolYearId: yearId,
      name: "Foreign Class",
      status: "active",
    });
    await tx.insert(students).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolB,
      fullName: "Foreign Student",
      status: "active",
    });
  });

  return {
    adminToken: await login(s.adminA),
    teacherToken: await login(s.teacherA),
    staffToken: await login(s.staffA),
    parentToken: await login(s.parentA),
    ...data,
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      await tx
        .delete(parentRequests)
        .where(eq(parentRequests.schoolId, schoolId));
      await tx.delete(attendance).where(eq(attendance.schoolId, schoolId));
      await tx
        .delete(studentBalances)
        .where(eq(studentBalances.schoolId, schoolId));
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
    .where(
      inArray(users.globalPhone, [
        s.adminA,
        s.adminB,
        s.teacherA,
        s.staffA,
        s.parentA,
      ]),
    );
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

function headers(token: string) {
  return { authorization: `Bearer ${token}` };
}

test("dashboard stats aggregates the tenant data for the requested date", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request(
      `/api/v1/school/dashboard/stats?date=${dashboardDate}`,
      { headers: headers(fixture.adminToken) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        totalStudents: number;
        totalClasses: number;
        todayAttendance: { total: number; present: number; percentage: number };
        uncollectedTuition: number;
        pendingRequests: number;
      };
    };
    expect(body.data).toEqual({
      totalStudents: 2,
      totalClasses: 2,
      todayAttendance: { total: 2, present: 1, percentage: 50 },
      uncollectedTuition: 1200,
      pendingRequests: 2,
    });
  } finally {
    await cleanup(s);
  }
});

test("dashboard recent activities are normalized and sorted newest first", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request(
      "/api/v1/school/dashboard/recent-activities",
      { headers: headers(fixture.adminToken) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ type: string; createdAt: string }>;
    };
    expect(body.data.length).toBeLessThanOrEqual(10);
    expect(body.data.slice(0, 4).map((item) => item.type)).toEqual([
      "student_created",
      "parent_request_created",
      "class_created",
      "student_created",
    ]);
    for (let index = 1; index < body.data.length; index++) {
      expect(
        new Date(body.data[index - 1]!.createdAt).getTime(),
      ).toBeGreaterThanOrEqual(new Date(body.data[index]!.createdAt).getTime());
    }
  } finally {
    await cleanup(s);
  }
});

test("dashboard alerts include overdue requests and unmarked active classes", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request(
      `/api/v1/school/dashboard/alerts?date=${dashboardDate}`,
      { headers: headers(fixture.adminToken) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        pendingRequestsOverdue: Array<{ content: string }>;
        unmarkedClasses: Array<{ id: string; name: string }>;
      };
    };
    expect(body.data.pendingRequestsOverdue).toHaveLength(1);
    expect(body.data.pendingRequestsOverdue[0]?.content).toBe(
      "Overdue request",
    );
    expect(body.data.unmarkedClasses).toEqual([
      expect.objectContaining({
        id: fixture.classUnmarkedId,
        name: "Unmarked Class",
      }),
    ]);
  } finally {
    await cleanup(s);
  }
});

test("dashboard is restricted to school admins", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    for (const token of [
      fixture.teacherToken,
      fixture.staffToken,
      fixture.parentToken,
    ]) {
      const response = await app.request("/api/v1/school/dashboard/stats", {
        headers: headers(token),
      });
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
    }
  } finally {
    await cleanup(s);
  }
});

test("dashboard statistics are isolated to the admin school", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request(
      `/api/v1/school/dashboard/stats?date=${dashboardDate}`,
      { headers: headers(fixture.adminToken) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { totalStudents: number; totalClasses: number };
    };
    expect(body.data.totalStudents).toBe(2);
    expect(body.data.totalClasses).toBe(2);
  } finally {
    await cleanup(s);
  }
});
