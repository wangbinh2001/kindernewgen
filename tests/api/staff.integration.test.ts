import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classes,
  schoolMemberships,
  schoolYears,
  schools,
  teacherAssignments,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-staff-a-${id}`,
    schoolB: `test-staff-b-${id}`,
    adminA: `0971${digits}`,
    adminB: `0982${digits}`,
    teacher: `0993${digits}`,
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
  return { tokenA: await login(s.adminA), tokenB: await login(s.adminB) };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.adminA, s.adminB, s.teacher]));
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      const classRows = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.schoolId, schoolId));
      for (const row of classRows) {
        await tx
          .delete(teacherAssignments)
          .where(eq(teacherAssignments.classId, row.id));
      }
      await tx.delete(classes).where(eq(classes.schoolId, schoolId));
      await tx.delete(schoolYears).where(eq(schoolYears.schoolId, schoolId));
    });
  }
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

async function createClass(token: string) {
  const year = await app.request("/api/v1/school/school-years", {
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
  expect(year.status).toBe(201);
  const schoolYearId = ((await year.json()) as { data: { id: string } }).data
    .id;
  const response = await app.request("/api/v1/school/classes", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Sunflower", schoolYearId }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

test("school admin can create staff, link existing phone, lock, and assign teacher", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const create = await app.request("/api/v1/school/staff", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        globalPhone: s.teacher,
        displayName: "Teacher One",
        role: "teacher",
      }),
    });
    expect(create.status).toBe(201);
    const teacherId = ((await create.json()) as { data: { userId: string } })
      .data.userId;
    const linked = await app.request("/api/v1/school/staff", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        globalPhone: s.teacher,
        displayName: "Staff One",
        role: "staff",
      }),
    });
    expect(linked.status).toBe(201);
    const memberships = await db
      .select()
      .from(schoolMemberships)
      .where(eq(schoolMemberships.userId, teacherId));
    expect(memberships).toHaveLength(2);
    const samePhoneUsers = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, s.teacher));
    expect(samePhoneUsers).toHaveLength(1);
    const classId = await createClass(tokenA);
    const assigned = await app.request(
      `/api/v1/school/staff/${teacherId}/assign-class`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ classId }),
      },
    );
    expect(assigned.status).toBe(200);
    const [assignment] = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(teacherAssignments)
        .where(eq(teacherAssignments.classId, classId)),
    );
    expect(assignment?.teacherId).toBe(teacherId);
    const [updatedClass] = await withTenant(s.schoolA, (tx) =>
      tx.select().from(classes).where(eq(classes.id, classId)),
    );
    expect(updatedClass?.teacherId).toBe(teacherId);
    const locked = await app.request(
      `/api/v1/school/staff/${teacherId}/status`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "locked" }),
      },
    );
    expect(locked.status).toBe(200);
    const [membership] = await db
      .select()
      .from(schoolMemberships)
      .where(
        and(
          eq(schoolMemberships.userId, teacherId),
          eq(schoolMemberships.schoolId, s.schoolA),
          eq(schoolMemberships.role, "teacher"),
        ),
      );
    expect(membership?.status).toBe("locked");
    const other = await app.request("/api/v1/school/staff", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(other.status).toBe(200);
    expect(
      ((await other.json()) as { data: Array<{ userId: string }> }).data.some(
        (item) => item.userId === teacherId,
      ),
    ).toBe(false);
  } finally {
    await cleanup(s);
  }
});
