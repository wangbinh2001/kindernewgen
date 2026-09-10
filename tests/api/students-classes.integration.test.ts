import { expect, test } from "bun:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classHistory,
  classStudents,
  classes,
  parentChildren,
  responsiblePersons,
  schoolMemberships,
  schoolYears,
  schools,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

type Scenario = {
  schoolId: string;
  foreignSchoolId: string;
  foreignClassId: string;
  phone: string;
  parentPhone: string;
  token: string;
  schoolYearId: string;
  firstClassId: string;
  secondClassId: string;
};

async function login(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { token: string } }).data.token;
}

async function setup(): Promise<Scenario> {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  const scenario = {
    schoolId: `test-enrollment-school-${id}`,
    foreignSchoolId: `test-enrollment-foreign-${id}`,
    phone: `0951${digits}`,
    parentPhone: `0961${digits}`,
  };
  await db.insert(schools).values({
    id: scenario.schoolId,
    name: `Enrollment School ${scenario.schoolId}`,
  });
  await db.insert(schools).values({
    id: scenario.foreignSchoolId,
    name: `Foreign Enrollment School ${scenario.foreignSchoolId}`,
  });
  await registerParent({
    phone: scenario.phone,
    schoolId: scenario.schoolId,
    displayName: "Enrollment Admin",
  });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, scenario.phone));
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, scenario.schoolId),
      ),
    );
  const token = await login(scenario.phone);
  const yearResponse = await app.request("/api/v1/school/school-years", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
    }),
  });
  expect(yearResponse.status).toBe(201);
  const schoolYearId = ((await yearResponse.json()) as { data: { id: string } })
    .data.id;

  const createClass = async (name: string) => {
    const response = await app.request("/api/v1/school/classes", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name, schoolYearId }),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };

  const foreignSchoolYearId = crypto.randomUUID();
  const foreignClassId = crypto.randomUUID();
  await withTenant(scenario.foreignSchoolId, async (tx) => {
    await tx.insert(schoolYears).values({
      id: foreignSchoolYearId,
      schoolId: scenario.foreignSchoolId,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
    });
    await tx.insert(classes).values({
      id: foreignClassId,
      schoolId: scenario.foreignSchoolId,
      schoolYearId: foreignSchoolYearId,
      name: "Foreign Class",
    });
  });

  return {
    ...scenario,
    token,
    foreignClassId,
    schoolYearId,
    firstClassId: await createClass("Sunflower"),
    secondClassId: await createClass("Rainbow"),
  };
}

function studentPayload(scenario: Scenario, classId: string) {
  return {
    full_name: "Enrolled Student",
    dob: "2020-01-02",
    gender: "female",
    cccd: crypto.randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12),
    responsiblePersons: [
      {
        type: "mother",
        fullName: "Enrollment Parent",
        yearOfBirth: 1990,
        cccd: "079000000101",
        phone: scenario.parentPhone,
      },
    ],
    classId,
  };
}

async function createStudent(scenario: Scenario) {
  const response = await app.request("/api/v1/school/students", {
    method: "POST",
    headers: {
      authorization: `Bearer ${scenario.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(studentPayload(scenario, scenario.firstClassId)),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

async function cleanup(scenario: Scenario) {
  const tenantStudents = await withTenant(scenario.schoolId, (tx) =>
    tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.schoolId, scenario.schoolId)),
  );
  const studentIds = tenantStudents.map(({ id }) => id);
  if (studentIds.length > 0) {
    await db
      .delete(parentChildren)
      .where(inArray(parentChildren.childId, studentIds));
    await withTenant(scenario.schoolId, async (tx) => {
      await tx
        .delete(classHistory)
        .where(inArray(classHistory.studentId, studentIds));
      await tx
        .delete(classStudents)
        .where(inArray(classStudents.studentId, studentIds));
      await tx
        .delete(responsiblePersons)
        .where(inArray(responsiblePersons.studentId, studentIds));
      await tx.delete(students).where(inArray(students.id, studentIds));
    });
  }
  await withTenant(scenario.schoolId, async (tx) => {
    await tx.delete(classes).where(eq(classes.schoolId, scenario.schoolId));
    await tx
      .delete(schoolYears)
      .where(eq(schoolYears.schoolId, scenario.schoolId));
  });
  await withTenant(scenario.foreignSchoolId, async (tx) => {
    await tx
      .delete(classes)
      .where(eq(classes.schoolId, scenario.foreignSchoolId));
    await tx
      .delete(schoolYears)
      .where(eq(schoolYears.schoolId, scenario.foreignSchoolId));
  });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, scenario.phone));
  if (user) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  const [parent] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, scenario.parentPhone));
  if (parent) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, parent.id));
    await db.delete(users).where(eq(users.id, parent.id));
  }
  await db.delete(schools).where(eq(schools.id, scenario.schoolId));
  await db.delete(schools).where(eq(schools.id, scenario.foreignSchoolId));
}

test("creating a student with classId creates enrollment and history", async () => {
  const scenario = await setup();
  try {
    const studentId = await createStudent(scenario);
    const result = await withTenant(scenario.schoolId, async (tx) => ({
      ["student"]: (
        await tx.select().from(students).where(eq(students.id, studentId))
      )[0],
      enrollments: await tx
        .select()
        .from(classStudents)
        .where(eq(classStudents.studentId, studentId)),
      history: await tx
        .select()
        .from(classHistory)
        .where(eq(classHistory.studentId, studentId)),
    }));
    expect(result.student?.currentClassId).toBe(scenario.firstClassId);
    expect(result.enrollments).toHaveLength(1);
    expect(result.enrollments[0]?.schoolId).toBe(scenario.schoolId);
    expect(result.enrollments[0]?.schoolYearId).toBe(scenario.schoolYearId);
    expect(result.enrollments[0]?.leftAt).toBeNull();
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.classId).toBe(scenario.firstClassId);
    expect(result.history[0]?.leftAt).toBeNull();
  } finally {
    await cleanup(scenario);
  }
});

test("transfer-class closes old history and records the new class", async () => {
  const scenario = await setup();
  try {
    const studentId = await createStudent(scenario);
    const response = await app.request(
      `/api/v1/school/students/${studentId}/transfer-class`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${scenario.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ newClassId: scenario.secondClassId }),
      },
    );
    expect(response.status).toBe(200);
    const result = await withTenant(scenario.schoolId, async (tx) => ({
      student: (
        await tx.select().from(students).where(eq(students.id, studentId))
      )[0],
      enrollments: await tx
        .select()
        .from(classStudents)
        .where(eq(classStudents.studentId, studentId))
        .orderBy(asc(classStudents.enrolledAt)),
      history: await tx
        .select()
        .from(classHistory)
        .where(eq(classHistory.studentId, studentId))
        .orderBy(asc(classHistory.enrolledAt)),
    }));
    expect(result.student?.currentClassId).toBe(scenario.secondClassId);
    expect(result.enrollments[0]?.leftAt).not.toBeNull();
    expect(result.enrollments[1]?.leftAt).toBeNull();
    expect(result.enrollments[1]?.schoolId).toBe(scenario.schoolId);
    expect(result.history).toHaveLength(2);
    expect(result.history[0]?.classId).toBe(scenario.firstClassId);
    expect(result.history[0]?.leftAt).not.toBeNull();
    expect(result.history[1]?.classId).toBe(scenario.secondClassId);
    expect(result.history[1]?.leftAt).toBeNull();
  } finally {
    await cleanup(scenario);
  }
});

test("transfer-class rejects a class from another tenant", async () => {
  const scenario = await setup();
  try {
    const studentId = await createStudent(scenario);
    const response = await app.request(
      `/api/v1/school/students/${studentId}/transfer-class`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${scenario.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ newClassId: scenario.foreignClassId }),
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
    const [student] = await withTenant(scenario.schoolId, (tx) =>
      tx.select().from(students).where(eq(students.id, studentId)),
    );
    expect(student?.currentClassId).toBe(scenario.firstClassId);
  } finally {
    await cleanup(scenario);
  }
});

test("class deletion is rejected while students are enrolled", async () => {
  const scenario = await setup();
  try {
    await createStudent(scenario);
    const response = await app.request(
      `/api/v1/school/classes/${scenario.firstClassId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${scenario.token}` },
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
  } finally {
    await cleanup(scenario);
  }
});
