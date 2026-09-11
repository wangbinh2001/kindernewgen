import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  attendance,
  attendanceOptionalFees,
  classStudents,
  classes,
  foodItems,
  healthRecords,
  menus,
  parentChildren,
  responsiblePersons,
  schoolMemberships,
  schoolYears,
  schools,
  studentBalances,
  students,
  timelineEditHistory,
  timelineMedia,
  timelinePosts,
  timelineTags,
  tuitionAdjustments,
  tuitionHistory,
  tuitionItems,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-parent-portal-a-${id}`,
    schoolB: `test-parent-portal-b-${id}`,
    adminA: `0971${digits}`,
    parentA: `0972${digits}`,
    parentB: `0973${digits}`,
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

async function login(phone: string, password = "123456") {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  return {
    response,
    token:
      response.status === 200
        ? ((await response.json()) as { data: { token: string } }).data.token
        : null,
  };
}

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);
  const adminA = await member(s.adminA, s.schoolA, "school_admin");
  const parentA = await member(s.parentA, s.schoolA, "parent");
  const parentB = await member(s.parentB, s.schoolB, "parent");

  const schoolAData = await withTenant(s.schoolA, async (tx) => {
    const yearId = crypto.randomUUID();
    const classId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const foodItemId = crypto.randomUUID();
    const timelineChildId = crypto.randomUUID();
    const timelineClassId = crypto.randomUUID();
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
      name: "Portal Class A",
      status: "active",
    });
    await tx.insert(students).values({
      id: childId,
      schoolId: s.schoolA,
      fullName: "Portal Child A",
      dob: "2020-01-15",
      gender: "female",
      cccd: `PORTAL-${childId}`,
      cccdIssueDate: "2024-01-01",
      cccdIssuePlace: "Hanoi",
      address: "Parent address",
      currentClassId: classId,
      status: "active",
    });
    await tx.insert(responsiblePersons).values({
      id: crypto.randomUUID(),
      studentId: childId,
      type: "father",
      fullName: "Portal Father",
      yearOfBirth: 1988,
      cccd: `F-${childId}`,
      phone: "0988000000",
    });
    await tx.insert(classStudents).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      classId,
      studentId: childId,
      schoolYearId: yearId,
    });
    await tx.insert(parentChildren).values({
      id: crypto.randomUUID(),
      parentId: parentA.user.id,
      childId,
    });
    const attendanceId = crypto.randomUUID();
    await tx.insert(attendance).values({
      id: attendanceId,
      schoolId: s.schoolA,
      studentId: childId,
      classId,
      date: "2026-09-10",
      status: "late",
      note: "Traffic",
      state: "confirmed",
    });
    await tx.insert(studentBalances).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      studentId: childId,
      period: "2026-09-01",
      openingAmount: 1000,
      charges: 500,
      payments: 200,
      adjustments: 0,
      closingAmount: 1300,
    });
    const tuitionId = crypto.randomUUID();
    await tx.insert(tuitionHistory).values({
      id: tuitionId,
      schoolId: s.schoolA,
      studentId: childId,
      month: "2026-09-01",
      feeSnapshot: { basic: 500 },
      totalFees: 500,
      totalReduction: 0,
      finalAmount: 500,
      state: "confirmed",
      confirmedBy: adminA.membership.id,
      confirmedAt: new Date(),
    });
    await tx.insert(tuitionItems).values({
      id: crypto.randomUUID(),
      tuitionHistoryId: tuitionId,
      feeType: "basic",
      description: "Monthly tuition",
      amount: 500,
    });
    await tx.insert(healthRecords).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      studentId: childId,
      date: "2026-09-05",
      height: "105.00",
      weight: "18.00",
      bmi: "16.33",
      whoStandardVersion: "WHO_2006",
      ageMonths: 79,
      classification: "normal",
      note: "Healthy",
      createdBy: adminA.membership.id,
      state: "active",
    });
    await tx.insert(foodItems).values({
      id: foodItemId,
      schoolId: s.schoolA,
      name: "Portal Lunch",
      category: "lunch_main",
      description: "Rice and vegetables",
    });
    await tx.insert(menus).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      date: "2026-09-11",
      mealType: "lunch",
      foodItemId,
    });
    await tx.insert(timelinePosts).values([
      {
        id: timelineChildId,
        schoolId: s.schoolA,
        authorMembershipId: adminA.membership.id,
        type: "child",
        studentId: childId,
        content: "Child update",
        status: "active",
      },
      {
        id: timelineClassId,
        schoolId: s.schoolA,
        authorMembershipId: adminA.membership.id,
        type: "class",
        classId,
        content: "Class update",
        status: "active",
      },
    ]);
    await tx.insert(timelineTags).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      postId: timelineClassId,
      studentId: childId,
    });
    return { childId, classId };
  });

  const schoolBData = await withTenant(s.schoolB, async (tx) => {
    const yearId = crypto.randomUUID();
    const classId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    await tx.insert(schoolYears).values({
      id: yearId,
      schoolId: s.schoolB,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "active",
    });
    await tx.insert(classes).values({
      id: classId,
      schoolId: s.schoolB,
      schoolYearId: yearId,
      name: "Portal Class B",
      status: "active",
    });
    await tx.insert(students).values({
      id: childId,
      schoolId: s.schoolB,
      fullName: "Portal Child B",
      dob: "2020-02-15",
      gender: "male",
      status: "active",
      currentClassId: classId,
    });
    await tx.insert(classStudents).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolB,
      classId,
      studentId: childId,
      schoolYearId: yearId,
    });
    await tx.insert(parentChildren).values({
      id: crypto.randomUUID(),
      parentId: parentB.user.id,
      childId,
    });
    await tx.insert(attendance).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolB,
      studentId: childId,
      classId,
      date: "2026-09-10",
      status: "present",
      state: "confirmed",
    });
    return { childId };
  });

  const loggedIn = await login(s.parentA);
  expect(loggedIn.response.status).toBe(200);
  return {
    childAId: schoolAData.childId,
    childBId: schoolBData.childId,
    parentAToken: loggedIn.token!,
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      const childRows = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.schoolId, schoolId));
      const childIds = childRows.map((row) => row.id);
      const attendanceRows = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(eq(attendance.schoolId, schoolId));
      const attendanceIds = attendanceRows.map((row) => row.id);
      const tuitionRows = await tx
        .select({ id: tuitionHistory.id })
        .from(tuitionHistory)
        .where(eq(tuitionHistory.schoolId, schoolId));
      const tuitionIds = tuitionRows.map((row) => row.id);
      const postRows = await tx
        .select({ id: timelinePosts.id })
        .from(timelinePosts)
        .where(eq(timelinePosts.schoolId, schoolId));
      const postIds = postRows.map((row) => row.id);
      if (attendanceIds.length) {
        await tx
          .delete(attendanceOptionalFees)
          .where(inArray(attendanceOptionalFees.attendanceId, attendanceIds));
      }
      await tx.delete(attendance).where(eq(attendance.schoolId, schoolId));
      if (tuitionIds.length) {
        await tx
          .delete(tuitionItems)
          .where(inArray(tuitionItems.tuitionHistoryId, tuitionIds));
        await tx
          .delete(tuitionAdjustments)
          .where(inArray(tuitionAdjustments.tuitionHistoryId, tuitionIds));
      }
      await tx
        .delete(tuitionHistory)
        .where(eq(tuitionHistory.schoolId, schoolId));
      if (postIds.length) {
        await tx
          .delete(timelineMedia)
          .where(inArray(timelineMedia.postId, postIds));
        await tx
          .delete(timelineTags)
          .where(inArray(timelineTags.postId, postIds));
        await tx
          .delete(timelineEditHistory)
          .where(inArray(timelineEditHistory.postId, postIds));
      }
      await tx
        .delete(timelinePosts)
        .where(eq(timelinePosts.schoolId, schoolId));
      await tx
        .delete(healthRecords)
        .where(eq(healthRecords.schoolId, schoolId));
      await tx
        .delete(studentBalances)
        .where(eq(studentBalances.schoolId, schoolId));
      await tx.delete(menus).where(eq(menus.schoolId, schoolId));
      await tx.delete(foodItems).where(eq(foodItems.schoolId, schoolId));
      if (childIds.length) {
        await tx
          .delete(parentChildren)
          .where(inArray(parentChildren.childId, childIds));
        await tx
          .delete(responsiblePersons)
          .where(inArray(responsiblePersons.studentId, childIds));
      }
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
    .where(inArray(users.globalPhone, [s.adminA, s.parentA, s.parentB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

test("parent children endpoint returns only linked child profile", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/parent/children", {
      headers: authHeaders(fixture.parentAToken),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{
        id: string;
        fullName: string;
        currentClass: { name: string };
      }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: fixture.childAId,
        fullName: "Portal Child A",
        currentClass: { name: "Portal Class A" },
      }),
    );
  } finally {
    await cleanup(s);
  }
});

test("parent child detail includes profile but no internal health standard", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request(
      `/api/v1/parent/children/${fixture.childAId}`,
      { headers: authHeaders(fixture.parentAToken) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { dob: string; gender: string; responsiblePersons: unknown[] };
    };
    expect(body.data).toEqual(
      expect.objectContaining({
        dob: "2020-01-15",
        gender: "female",
        responsiblePersons: expect.any(Array),
      }),
    );
  } finally {
    await cleanup(s);
  }
});

test("parent attendance is scoped to owned child and month", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const own = await app.request(
      `/api/v1/parent/children/${fixture.childAId}/attendance?month=2026-09`,
      { headers: authHeaders(fixture.parentAToken) },
    );
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as {
      data: Array<{ studentId: string; status: string }>;
    };
    expect(ownBody.data).toContainEqual(
      expect.objectContaining({ studentId: fixture.childAId, status: "late" }),
    );
    const byRange = await app.request(
      `/api/v1/parent/children/${fixture.childAId}/attendance?startDate=2026-09-10&endDate=2026-09-10`,
      { headers: authHeaders(fixture.parentAToken) },
    );
    expect(byRange.status).toBe(200);
    expect(((await byRange.json()) as { data: unknown[] }).data).toHaveLength(
      1,
    );
    const foreign = await app.request(
      `/api/v1/parent/children/${fixture.childBId}/attendance?month=2026-09`,
      { headers: authHeaders(fixture.parentAToken) },
    );
    expect(foreign.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});

test("parent can read tuition, health, timeline, and menu data safely", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = authHeaders(fixture.parentAToken);
    const tuition = await app.request(
      `/api/v1/parent/children/${fixture.childAId}/tuition`,
      { headers },
    );
    expect(tuition.status).toBe(200);
    const tuitionBody = (await tuition.json()) as {
      data: {
        history: Array<{ state: string }>;
        balances: Array<{ closingAmount: number }>;
      };
    };
    expect(tuitionBody.data.history[0]?.state).toBe("confirmed");
    expect(tuitionBody.data.balances[0]?.closingAmount).toBe(1300);

    const health = await app.request(
      `/api/v1/parent/children/${fixture.childAId}/health`,
      { headers },
    );
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as {
      data: Array<Record<string, unknown>>;
    };
    expect(healthBody.data[0]?.bmi).toBe(16.33);
    expect(healthBody.data[0]).not.toHaveProperty("whoStandardVersion");

    const timeline = await app.request(
      `/api/v1/parent/children/${fixture.childAId}/timeline`,
      { headers },
    );
    expect(timeline.status).toBe(200);
    const timelineBody = (await timeline.json()) as {
      data: Array<{ content: string }>;
    };
    expect(timelineBody.data.map((post) => post.content)).toEqual(
      expect.arrayContaining(["Child update", "Class update"]),
    );

    const menu = await app.request("/api/v1/parent/menu?date=2026-09-11", {
      headers,
    });
    expect(menu.status).toBe(200);
    const menuBody = (await menu.json()) as {
      data: Array<{ foodName: string }>;
    };
    expect(menuBody.data[0]?.foodName).toBe("Portal Lunch");
  } finally {
    await cleanup(s);
  }
});

test("parent can change password and must_change_password is cleared", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const changed = await app.request("/api/v1/parent/change-password", {
      method: "POST",
      headers: {
        ...authHeaders(fixture.parentAToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "123456",
        newPassword: "654321",
      }),
    });
    expect(changed.status).toBe(200);
    const oldLogin = await login(s.parentA, "123456");
    expect(oldLogin.response.status).toBe(401);
    const newLogin = await login(s.parentA, "654321");
    expect(newLogin.response.status).toBe(200);
    const [user] = await db
      .select({ mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.globalPhone, s.parentA));
    expect(user?.mustChangePassword).toBe(false);
  } finally {
    await cleanup(s);
  }
});

test("parent cannot access another tenant child through any child endpoint", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const paths = [
      `/api/v1/parent/children/${fixture.childBId}`,
      `/api/v1/parent/children/${fixture.childBId}/tuition`,
      `/api/v1/parent/children/${fixture.childBId}/health`,
      `/api/v1/parent/children/${fixture.childBId}/timeline`,
    ];
    for (const path of paths) {
      const response = await app.request(path, {
        headers: authHeaders(fixture.parentAToken),
      });
      expect(response.status).toBe(404);
    }
  } finally {
    await cleanup(s);
  }
});
