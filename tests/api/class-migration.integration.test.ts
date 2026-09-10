import { expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classHistory,
  classStudents,
  classes,
  schoolMemberships,
  schoolYears,
  schools,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

type Scenario = {
  schoolA: string;
  schoolB: string;
  phoneA: string;
  phoneB: string;
};

function scenario(): Scenario {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-migration-a-${id}`,
    schoolB: `test-migration-b-${id}`,
    phoneA: `0951${digits}`,
    phoneB: `0962${digits}`,
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

async function setup(s: Scenario) {
  await db.insert(schools).values([
    { id: s.schoolA, name: `Migration A ${s.schoolA}` },
    { id: s.schoolB, name: `Migration B ${s.schoolB}` },
  ]);
  for (const [phone, schoolId] of [
    [s.phoneA, s.schoolA],
    [s.phoneB, s.schoolB],
  ] as const) {
    const registered = await registerParent({
      phone,
      schoolId,
      displayName: "School Admin",
    });
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(
        and(
          eq(schoolMemberships.userId, registered.user.id),
          eq(schoolMemberships.schoolId, schoolId),
        ),
      );
  }
  return { tokenA: await login(s.phoneA), tokenB: await login(s.phoneB) };
}

async function cleanup(s: Scenario) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      const schoolStudents = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.schoolId, schoolId));
      const studentIds = schoolStudents.map((row) => row.id);
      if (studentIds.length) {
        await tx
          .delete(classStudents)
          .where(inArray(classStudents.studentId, studentIds));
        await tx
          .delete(classHistory)
          .where(inArray(classHistory.studentId, studentIds));
        await tx.delete(students).where(inArray(students.id, studentIds));
      }
      await tx.delete(classes).where(eq(classes.schoolId, schoolId));
      await tx.delete(schoolYears).where(eq(schoolYears.schoolId, schoolId));
    });
  }
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.phoneA, s.phoneB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

async function seedMigration(schoolId: string, archived = false) {
  return withTenant(schoolId, async (tx) => {
    const sourceYearId = crypto.randomUUID();
    const targetYearId = crypto.randomUUID();
    const sourceClassId = crypto.randomUUID();
    const studentIds = [crypto.randomUUID(), crypto.randomUUID()];
    await tx.insert(schoolYears).values([
      {
        id: sourceYearId,
        schoolId,
        name: `2025-2026-${sourceYearId}`,
        startDate: "2025-09-01",
        endDate: "2026-06-30",
        status: "active",
      },
      {
        id: targetYearId,
        schoolId,
        name: `2026-2027-${targetYearId}`,
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        status: archived ? "archived" : "coming_soon",
      },
    ]);
    await tx.insert(classes).values({
      id: sourceClassId,
      schoolId,
      schoolYearId: sourceYearId,
      name: "Sunflower",
      status: "active",
    });
    await tx.insert(students).values(
      studentIds.map((id, index) => ({
        id,
        schoolId,
        fullName: `Student ${index + 1}`,
        currentClassId: sourceClassId,
      })),
    );
    const enrolledAt = new Date();
    await tx.insert(classStudents).values(
      studentIds.map((studentId) => ({
        id: crypto.randomUUID(),
        schoolId,
        classId: sourceClassId,
        studentId,
        schoolYearId: sourceYearId,
        enrolledAt,
      })),
    );
    await tx.insert(classHistory).values(
      studentIds.map((studentId) => ({
        id: crypto.randomUUID(),
        schoolId,
        studentId,
        classId: sourceClassId,
        schoolYearId: sourceYearId,
        enrolledAt,
      })),
    );
    return { sourceClassId, sourceYearId, targetYearId, studentIds };
  });
}

test("migrates active students to a new class in the target school year", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const seeded = await seedMigration(s.schoolA);
    const response = await app.request(
      `/api/v1/school/classes/${seeded.sourceClassId}/migrate`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetSchoolYearId: seeded.targetYearId }),
      },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        newClass: { id: string; name: string; schoolYearId: string };
        migratedStudentCount: number;
      };
    };
    expect(body.data.newClass).toMatchObject({
      name: "Sunflower",
      schoolYearId: seeded.targetYearId,
    });
    expect(body.data.migratedStudentCount).toBe(2);

    await withTenant(s.schoolA, async (tx) => {
      const activeOld = await tx
        .select({ id: classStudents.id })
        .from(classStudents)
        .where(
          and(
            eq(classStudents.classId, seeded.sourceClassId),
            isNull(classStudents.leftAt),
          ),
        );
      const newEnrollments = await tx
        .select()
        .from(classStudents)
        .where(eq(classStudents.classId, body.data.newClass.id));
      const currentStudents = await tx
        .select({ id: students.id, currentClassId: students.currentClassId })
        .from(students)
        .where(inArray(students.id, seeded.studentIds));
      const histories = await tx
        .select()
        .from(classHistory)
        .where(inArray(classHistory.studentId, seeded.studentIds));
      expect(activeOld).toHaveLength(0);
      expect(newEnrollments).toHaveLength(2);
      expect(currentStudents).toEqual(
        expect.arrayContaining(
          seeded.studentIds.map((id) =>
            expect.objectContaining({
              id,
              currentClassId: body.data.newClass.id,
            }),
          ),
        ),
      );
      expect(
        histories.filter(
          (history) => history.classId === body.data.newClass.id,
        ),
      ).toHaveLength(2);
      expect(
        histories.filter(
          (history) =>
            history.classId === seeded.sourceClassId && history.leftAt,
        ),
      ).toHaveLength(2);
    });
  } finally {
    await cleanup(s);
  }
});

test("rejects migration to an archived school year", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const seeded = await seedMigration(s.schoolA, true);
    const response = await app.request(
      `/api/v1/school/classes/${seeded.sourceClassId}/migrate`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetSchoolYearId: seeded.targetYearId }),
      },
    );
    expect(response.status).toBe(400);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code,
    ).toBe("VALIDATION_ERROR");
  } finally {
    await cleanup(s);
  }
});

test("rejects migration when the target class name already exists", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const seeded = await seedMigration(s.schoolA);
    await withTenant(s.schoolA, (tx) =>
      tx.insert(classes).values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        schoolYearId: seeded.targetYearId,
        name: "Sunflower",
      }),
    );
    const response = await app.request(
      `/api/v1/school/classes/${seeded.sourceClassId}/migrate`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetSchoolYearId: seeded.targetYearId }),
      },
    );
    expect(response.status).toBe(400);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code,
    ).toBe("VALIDATION_ERROR");
  } finally {
    await cleanup(s);
  }
});

test("cannot migrate a class from another tenant", async () => {
  const s = scenario();
  try {
    const { tokenB } = await setup(s);
    const seededA = await seedMigration(s.schoolA);
    const seededB = await seedMigration(s.schoolB);
    const response = await app.request(
      `/api/v1/school/classes/${seededA.sourceClassId}/migrate`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenB}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetSchoolYearId: seededB.targetYearId }),
      },
    );
    expect(response.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
