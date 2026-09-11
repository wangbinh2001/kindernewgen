import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classStudents,
  classes,
  parentChildren,
  parentRequestAttachments,
  parentRequestHistory,
  parentRequests,
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
    schoolA: `test-parent-request-a-${id}`,
    schoolB: `test-parent-request-b-${id}`,
    adminA: `0961${digits}`,
    adminB: `0962${digits}`,
    teacherA: `0963${digits}`,
    parentA: `0964${digits}`,
    parentB: `0965${digits}`,
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
  return user!;
}

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);
  await member(s.adminA, s.schoolA, "school_admin");
  await member(s.adminB, s.schoolB, "school_admin");
  const teacher = await member(s.teacherA, s.schoolA, "teacher");
  const parentA = await member(s.parentA, s.schoolA, "parent");
  const parentB = await member(s.parentB, s.schoolA, "parent");
  const fixture = await withTenant(s.schoolA, async (tx) => {
    const yearId = crypto.randomUUID();
    const classAId = crypto.randomUUID();
    const classBId = crypto.randomUUID();
    const childAId = crypto.randomUUID();
    const childBId = crypto.randomUUID();
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
        name: "Requests A",
        status: "active",
      },
      {
        id: classBId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Requests B",
        status: "active",
      },
    ]);
    await tx.insert(students).values([
      { id: childAId, schoolId: s.schoolA, fullName: "Request Child A" },
      { id: childBId, schoolId: s.schoolA, fullName: "Request Child B" },
    ]);
    await tx.insert(classStudents).values([
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        classId: classAId,
        studentId: childAId,
        schoolYearId: yearId,
      },
      {
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        classId: classBId,
        studentId: childBId,
        schoolYearId: yearId,
      },
    ]);
    await tx.insert(teacherAssignments).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      teacherId: teacher.id,
      classId: classAId,
      status: "active",
    });
    await tx.insert(parentChildren).values([
      { id: crypto.randomUUID(), parentId: parentA.id, childId: childAId },
      { id: crypto.randomUUID(), parentId: parentB.id, childId: childBId },
    ]);
    return { classAId, classBId, childAId, childBId };
  });
  return {
    ...fixture,
    adminToken: await login(s.adminA),
    otherAdminToken: await login(s.adminB),
    teacherToken: await login(s.teacherA),
    parentAToken: await login(s.parentA),
    parentBToken: await login(s.parentB),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  await withTenant(s.schoolA, async (tx) => {
    const requests = await tx
      .select({ id: parentRequests.id })
      .from(parentRequests)
      .where(eq(parentRequests.schoolId, s.schoolA));
    if (requests.length) {
      const ids = requests.map((request) => request.id);
      await tx
        .delete(parentRequestAttachments)
        .where(inArray(parentRequestAttachments.requestId, ids));
      await tx
        .delete(parentRequestHistory)
        .where(inArray(parentRequestHistory.requestId, ids));
    }
    await tx
      .delete(parentRequests)
      .where(eq(parentRequests.schoolId, s.schoolA));
    await tx.delete(parentChildren).where(
      inArray(
        parentChildren.childId,
        (
          await tx
            .select({ id: students.id })
            .from(students)
            .where(eq(students.schoolId, s.schoolA))
        ).map((row) => row.id),
      ),
    );
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
      inArray(users.globalPhone, [
        s.adminA,
        s.adminB,
        s.teacherA,
        s.parentA,
        s.parentB,
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

function jsonHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

test("parent can create and list a request with attachment", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const created = await app.request("/api/v1/parent/requests", {
      method: "POST",
      headers: jsonHeaders(fixture.parentAToken),
      body: JSON.stringify({
        childId: fixture.childAId,
        type: "absence",
        content: "Child is sick today",
        urgent: true,
        attachments: [
          {
            fileUrl: "https://cdn.example/doctor-note.pdf",
            fileType: "pdf",
            fileName: "doctor-note.pdf",
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const requestId = ((await created.json()) as { data: { id: string } }).data
      .id;
    const listed = await app.request("/api/v1/parent/requests", {
      headers: { authorization: `Bearer ${fixture.parentAToken}` },
    });
    expect(listed.status).toBe(200);
    const data = (await listed.json()) as {
      data: Array<{ id: string; childId: string; status: string }>;
    };
    expect(data.data).toContainEqual(
      expect.objectContaining({
        id: requestId,
        childId: fixture.childAId,
        status: "pending",
      }),
    );
    const foreign = await app.request(
      `/api/v1/school/parent-requests/${requestId}`,
      { headers: { authorization: `Bearer ${fixture.otherAdminToken}` } },
    );
    expect(foreign.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});

test("teacher list only includes requests from assigned classes", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    for (const [token, childId] of [
      [fixture.parentAToken, fixture.childAId],
      [fixture.parentBToken, fixture.childBId],
    ] as const) {
      const created = await app.request("/api/v1/parent/requests", {
        method: "POST",
        headers: jsonHeaders(token),
        body: JSON.stringify({
          childId,
          type: "medical",
          content: `Request for ${childId}`,
        }),
      });
      expect(created.status).toBe(201);
    }
    const listed = await app.request("/api/v1/school/parent-requests", {
      headers: { authorization: `Bearer ${fixture.teacherToken}` },
    });
    expect(listed.status).toBe(200);
    const data = (await listed.json()) as {
      data: Array<{ childId: string }>;
    };
    expect(data.data).toHaveLength(1);
    expect(data.data[0]?.childId).toBe(fixture.childAId);
  } finally {
    await cleanup(s);
  }
});

test("teacher can resolve a request and status history is recorded", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const created = await app.request("/api/v1/parent/requests", {
      method: "POST",
      headers: jsonHeaders(fixture.parentAToken),
      body: JSON.stringify({
        childId: fixture.childAId,
        type: "late_arrival",
        content: "Arriving at 9 AM",
      }),
    });
    const requestId = ((await created.json()) as { data: { id: string } }).data
      .id;
    const resolved = await app.request(
      `/api/v1/school/parent-requests/${requestId}/resolve`,
      {
        method: "PUT",
        headers: jsonHeaders(fixture.teacherToken),
        body: JSON.stringify({ response: "Approved", note: "Noted" }),
      },
    );
    expect(resolved.status).toBe(200);
    const detail = await app.request(
      `/api/v1/school/parent-requests/${requestId}`,
      { headers: { authorization: `Bearer ${fixture.adminToken}` } },
    );
    expect(detail.status).toBe(200);
    const data = (await detail.json()) as {
      data: {
        status: string;
        response: string;
        history: Array<{ status: string }>;
      };
    };
    expect(data.data).toMatchObject({
      status: "resolved",
      response: "Approved",
    });
    expect(data.data.history.map((item) => item.status)).toEqual(
      expect.arrayContaining(["pending", "resolved"]),
    );
  } finally {
    await cleanup(s);
  }
});

test("parent can cancel pending request but not resolved request", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const create = async () => {
      const response = await app.request("/api/v1/parent/requests", {
        method: "POST",
        headers: jsonHeaders(fixture.parentAToken),
        body: JSON.stringify({
          childId: fixture.childAId,
          type: "other",
          content: "Please call me",
        }),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { data: { id: string } }).data.id;
    };
    const pendingId = await create();
    const cancelled = await app.request(
      `/api/v1/parent/requests/${pendingId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${fixture.parentAToken}` },
      },
    );
    expect(cancelled.status).toBe(200);

    const resolvedId = await create();
    const resolved = await app.request(
      `/api/v1/school/parent-requests/${resolvedId}/resolve`,
      {
        method: "PUT",
        headers: jsonHeaders(fixture.adminToken),
        body: JSON.stringify({ response: "Done" }),
      },
    );
    expect(resolved.status).toBe(200);
    const blocked = await app.request(`/api/v1/parent/requests/${resolvedId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${fixture.parentAToken}` },
    });
    expect(blocked.status).toBe(400);
  } finally {
    await cleanup(s);
  }
});
