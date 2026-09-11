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
  optionalFees,
  schoolMemberships,
  schoolYears,
  schools,
  students,
  teacherAssignments,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

const date = "2026-09-10";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    school: `test-attendance-${id}`,
    admin: `0911${digits}`,
    teacherA: `0912${digits}`,
    teacherB: `0913${digits}`,
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
  await db.insert(schools).values({ id: s.school, name: s.school });
  await member(s.admin, s.school, "school_admin");
  await member(s.teacherA, s.school, "teacher");
  await member(s.teacherB, s.school, "teacher");
  const [teacherA] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.teacherA));
  const [teacherB] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.teacherB));
  const fixture = await withTenant(s.school, async (tx) => {
    const yearId = crypto.randomUUID();
    const classAId = crypto.randomUUID();
    const classBId = crypto.randomUUID();
    const studentAId = crypto.randomUUID();
    const studentBId = crypto.randomUUID();
    await tx.insert(schoolYears).values({
      id: yearId,
      schoolId: s.school,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      status: "active",
    });
    await tx.insert(classes).values([
      {
        id: classAId,
        schoolId: s.school,
        schoolYearId: yearId,
        name: "A",
        status: "active",
      },
      {
        id: classBId,
        schoolId: s.school,
        schoolYearId: yearId,
        name: "B",
        status: "active",
      },
    ]);
    await tx.insert(students).values([
      { id: studentAId, schoolId: s.school, fullName: "Student A" },
      { id: studentBId, schoolId: s.school, fullName: "Student B" },
    ]);
    await tx.insert(classStudents).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.school,
        classId: classAId,
        studentId: studentAId,
        schoolYearId: yearId,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.school,
        classId: classBId,
        studentId: studentBId,
        schoolYearId: yearId,
      },
    ]);
    await tx.insert(teacherAssignments).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.school,
        teacherId: teacherA!.id,
        classId: classAId,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.school,
        teacherId: teacherB!.id,
        classId: classBId,
      },
    ]);
    const [fee] = await tx
      .insert(optionalFees)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.school,
        name: "Breakfast",
        amount: 25000,
      })
      .returning();
    return { classAId, classBId, studentAId, studentBId, feeId: fee!.id };
  });
  return { token: await login(s.teacherA), ...fixture };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  await withTenant(s.school, async (tx) => {
    await tx
      .delete(attendanceOptionalFees)
      .where(eq(attendanceOptionalFees.schoolId, s.school));
    await tx.delete(attendance).where(eq(attendance.schoolId, s.school));
    await tx.delete(optionalFees).where(eq(optionalFees.schoolId, s.school));
    await tx.delete(classStudents).where(eq(classStudents.schoolId, s.school));
    await tx
      .delete(teacherAssignments)
      .where(eq(teacherAssignments.schoolId, s.school));
    await tx.delete(students).where(eq(students.schoolId, s.school));
    await tx.delete(classes).where(eq(classes.schoolId, s.school));
    await tx.delete(schoolYears).where(eq(schoolYears.schoolId, s.school));
  });
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.admin, s.teacherA, s.teacherB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(eq(schools.id, s.school));
}

function record(
  fixture: Awaited<ReturnType<typeof setup>>,
  state: "draft" | "confirmed" = "draft",
) {
  return {
    studentId: fixture.studentAId,
    classId: fixture.classAId,
    date,
    status: "present",
    state,
    optionalFeeIds: [fixture.feeId],
  };
}

test("teacher can save draft attendance for an assigned class", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/school/attendance", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ records: [record(fixture)] }),
    });
    expect(response.status).toBe(200);
    const listed = await app.request(
      `/api/v1/school/attendance?date=${date}&classId=${fixture.classAId}`,
      {
        headers: { authorization: `Bearer ${fixture.token}` },
      },
    );
    expect(listed.status).toBe(200);
    const item = (
      (await listed.json()) as {
        data: Array<{
          attendance: { status: string };
          optionalFees: Array<{ feeSnapshotAmount: number }>;
        }>;
      }
    ).data[0]!;
    expect(item.attendance.status).toBe("present");
    expect(item.optionalFees[0]?.feeSnapshotAmount).toBe(25000);
  } finally {
    await cleanup(s);
  }
});

test("teacher cannot save attendance for another teacher's class", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/school/attendance", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        records: [{ ...record(fixture), classId: fixture.classBId }],
      }),
    });
    expect(response.status).toBe(403);
  } finally {
    await cleanup(s);
  }
});

test("draft attendance is upserted on the second save", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    for (const status of ["present", "late"]) {
      const response = await app.request("/api/v1/school/attendance", {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ records: [{ ...record(fixture), status }] }),
      });
      expect(response.status).toBe(200);
    }
    const rows = await withTenant(s.school, (tx) =>
      tx
        .select()
        .from(attendance)
        .where(eq(attendance.studentId, fixture.studentAId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("late");
  } finally {
    await cleanup(s);
  }
});

test("confirmed attendance cannot be overwritten by bulk save", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      "content-type": "application/json",
    };
    expect(
      (
        await app.request("/api/v1/school/attendance", {
          method: "POST",
          headers,
          body: JSON.stringify({ records: [record(fixture, "confirmed")] }),
        })
      ).status,
    ).toBe(200);
    const blocked = await app.request("/api/v1/school/attendance", {
      method: "POST",
      headers,
      body: JSON.stringify({
        records: [{ ...record(fixture), status: "absent" }],
      }),
    });
    expect(blocked.status).toBe(400);
  } finally {
    await cleanup(s);
  }
});

test("adjustment voids confirmed attendance and creates a confirmed correction", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      "content-type": "application/json",
    };
    expect(
      (
        await app.request("/api/v1/school/attendance", {
          method: "POST",
          headers,
          body: JSON.stringify({ records: [record(fixture, "confirmed")] }),
        })
      ).status,
    ).toBe(200);
    const [old] = await withTenant(s.school, (tx) =>
      tx
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.studentId, fixture.studentAId),
            isNull(attendance.voidedReason),
          ),
        ),
    );
    const adjusted = await app.request(
      `/api/v1/school/attendance/${old!.id}/adjust`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...record(fixture, "confirmed"),
          status: "late",
          voidedReason: "Corrected after review",
        }),
      },
    );
    expect(adjusted.status).toBe(200);
    const rows = await withTenant(s.school, (tx) =>
      tx
        .select()
        .from(attendance)
        .where(eq(attendance.studentId, fixture.studentAId)),
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === old!.id)?.state).toBe("voided");
    const correction = rows.find((row) => row.id !== old!.id)!;
    expect(correction.state).toBe("confirmed");
    expect(correction.status).toBe("late");
    expect(correction.updatedBy).toBeDefined();
  } finally {
    await cleanup(s);
  }
});

test("qr-scan check-in creates a draft present record and records checkInTime", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      "content-type": "application/json",
    };

    const res = await app.request("/api/v1/school/attendance/qr-scan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: fixture.studentAId,
        type: "check_in",
        date,
        timestamp: "07:35",
      }),
    });
    expect(res.status).toBe(200);

    const [row] = await withTenant(s.school, (tx) =>
      tx
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.studentId, fixture.studentAId),
            eq(attendance.date, date),
          ),
        ),
    );
    expect(row).toBeDefined();
    expect(row?.status).toBe("present");
    expect(row?.checkInTime).toBe("07:35");
    expect(row?.state).toBe("draft");
  } finally {
    await cleanup(s);
  }
});

test("qr-scan check-out updates checkOutTime and computes overtime automatically", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      "content-type": "application/json",
    };

    // 1. Quét đón sáng
    await app.request("/api/v1/school/attendance/qr-scan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: fixture.studentAId,
        type: "check_in",
        date,
        timestamp: "07:30",
      }),
    });

    // 2. Quét trả chiều lúc 17:45 (Trường mặc định tan lúc 17:00 -> 45 phút overtime = 0.75 giờ)
    const checkoutRes = await app.request("/api/v1/school/attendance/qr-scan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: fixture.studentAId,
        type: "check_out",
        date,
        timestamp: "17:45",
      }),
    });
    expect(checkoutRes.status).toBe(200);

    const [row] = await withTenant(s.school, (tx) =>
      tx
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.studentId, fixture.studentAId),
            eq(attendance.date, date),
          ),
        ),
    );
    expect(row).toBeDefined();
    expect(row?.checkInTime).toBe("07:30");
    expect(row?.checkOutTime).toBe("17:45");
    expect(row?.overtimeStart).toBe("17:00");
    expect(row?.overtimeEnd).toBe("17:45");
    expect(row?.overtimeHours).toBe("0.75");
  } finally {
    await cleanup(s);
  }
});

test("teacher cannot qr-scan for a student in another teacher's class", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.token}`,
      "content-type": "application/json",
    };

    // Teacher A thử quét cho Student B (thuộc Class B do Teacher B phụ trách)
    const res = await app.request("/api/v1/school/attendance/qr-scan", {
      method: "POST",
      headers,
      body: JSON.stringify({
        studentId: fixture.studentBId,
        type: "check_in",
        date,
        timestamp: "08:00",
      }),
    });
    expect(res.status).toBe(403);
  } finally {
    await cleanup(s);
  }
});
