import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classStudents,
  classes,
  healthRecords,
  schoolMemberships,
  schoolYears,
  schools,
  students,
  teacherAssignments,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-health-a-${id}`,
    schoolB: `test-health-b-${id}`,
    adminA: `0921${digits}`,
    adminB: `0922${digits}`,
    teacherA: `0923${digits}`,
    teacherB: `0924${digits}`,
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
  await member(s.teacherB, s.schoolA, "teacher");

  const [teacherA, teacherB] = await Promise.all([
    db.select().from(users).where(eq(users.globalPhone, s.teacherA)),
    db.select().from(users).where(eq(users.globalPhone, s.teacherB)),
  ]);

  const fixture = await withTenant(s.schoolA, async (tx) => {
    const yearId = crypto.randomUUID();
    const classAId = crypto.randomUUID();
    const classBId = crypto.randomUUID();
    const studentAId = crypto.randomUUID();
    const studentBId = crypto.randomUUID();
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
        id: classAId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Health A",
        status: "active",
      },
      {
        id: classBId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Health B",
        status: "active",
      },
    ]);
    await tx.insert(students).values([
      {
        id: studentAId,
        schoolId: s.schoolA,
        fullName: "Health Student A",
        dob: "2020-01-01",
      },
      {
        id: studentBId,
        schoolId: s.schoolA,
        fullName: "Health Student B",
        dob: "2020-01-01",
      },
    ]);
    await tx.insert(classStudents).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        classId: classAId,
        studentId: studentAId,
        schoolYearId: yearId,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        classId: classBId,
        studentId: studentBId,
        schoolYearId: yearId,
      },
    ]);
    await tx.insert(teacherAssignments).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        teacherId: teacherA[0]!.id,
        classId: classAId,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        teacherId: teacherB[0]!.id,
        classId: classBId,
      },
    ]);
    return { classAId, classBId, studentAId, studentBId };
  });

  return {
    ...fixture,
    tokenA: await login(s.adminA),
    tokenB: await login(s.adminB),
    teacherAToken: await login(s.teacherA),
    teacherBToken: await login(s.teacherB),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  await withTenant(s.schoolA, async (tx) => {
    await tx.delete(healthRecords).where(eq(healthRecords.schoolId, s.schoolA));
    await tx
      .delete(teacherAssignments)
      .where(eq(teacherAssignments.schoolId, s.schoolA));
    await tx.delete(classStudents).where(eq(classStudents.schoolId, s.schoolA));
    await tx.delete(students).where(eq(students.schoolId, s.schoolA));
    await tx.delete(classes).where(eq(classes.schoolId, s.schoolA));
    await tx.delete(schoolYears).where(eq(schoolYears.schoolId, s.schoolA));
  });
  const found = await db
    .select()
    .from(users)
    .where(
      inArray(users.globalPhone, [s.adminA, s.adminB, s.teacherA, s.teacherB]),
    );
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("creates health record with BMI and age in months", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/school/health", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        studentId: fixture.studentAId,
        date: "2026-09-01",
        height: 110,
        weight: 20,
        note: "Routine check",
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: { bmi: number; ageMonths: number; whoStandardVersion: string };
    };
    expect(body.data.bmi).toBe(16.53);
    expect(body.data.ageMonths).toBe(80);
    expect(body.data.whoStandardVersion).toBe("WHO_2006");

    const listed = await app.request(
      `/api/v1/school/health?classId=${fixture.classAId}`,
      { headers: { authorization: `Bearer ${fixture.tokenA}` } },
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      data: Array<{ health: { bmi: number } | null }>;
    };
    expect(listBody.data[0]?.health?.bmi).toBe(16.53);

    const history = await app.request(
      `/api/v1/school/students/${fixture.studentAId}/health-history`,
      { headers: { authorization: `Bearer ${fixture.tokenA}` } },
    );
    expect(history.status).toBe(200);
    expect(((await history.json()) as { data: unknown[] }).data).toHaveLength(
      1,
    );
  } finally {
    await cleanup(s);
  }
});

test("teacher cannot view health for an unassigned class", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request(
      `/api/v1/school/health?classId=${fixture.classBId}`,
      { headers: { authorization: `Bearer ${fixture.teacherAToken}` } },
    );
    expect(response.status).toBe(403);
  } finally {
    await cleanup(s);
  }
});

test("voids a health record with an audit reason", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const created = await app.request("/api/v1/school/health", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        studentId: fixture.studentAId,
        date: "2026-09-01",
        height: 110,
        weight: 20,
      }),
    });
    const recordId = ((await created.json()) as { data: { id: string } }).data
      .id;
    const response = await app.request(
      `/api/v1/school/health/${recordId}/void`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "Entered incorrectly" }),
      },
    );
    expect(response.status).toBe(200);
    const [row] = await withTenant(s.schoolA, (tx) =>
      tx.select().from(healthRecords).where(eq(healthRecords.id, recordId)),
    );
    expect(row?.state).toBe("voided");
    expect(row?.voidedReason).toBe("Entered incorrectly");
  } finally {
    await cleanup(s);
  }
});

test("health records are isolated across tenants", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const foreignCreate = await app.request("/api/v1/school/health", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.tokenB}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        studentId: fixture.studentAId,
        date: "2026-09-01",
        height: 110,
        weight: 20,
      }),
    });
    expect(foreignCreate.status).toBe(404);
    const foreignList = await app.request(
      `/api/v1/school/health?classId=${fixture.classAId}`,
      { headers: { authorization: `Bearer ${fixture.tokenB}` } },
    );
    expect(foreignList.status).toBe(404);
    const foreignHistory = await app.request(
      `/api/v1/school/students/${fixture.studentAId}/health-history`,
      { headers: { authorization: `Bearer ${fixture.tokenB}` } },
    );
    expect(foreignHistory.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
