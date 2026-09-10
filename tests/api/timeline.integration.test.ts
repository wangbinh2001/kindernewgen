import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classStudents,
  classes,
  schoolMemberships,
  schoolYears,
  schools,
  students,
  teacherAssignments,
  timelineEditHistory,
  timelineMedia,
  timelinePosts,
  timelineTags,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-timeline-a-${id}`,
    schoolB: `test-timeline-b-${id}`,
    adminA: `0951${digits}`,
    adminB: `0952${digits}`,
    teacherA: `0953${digits}`,
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
  const [teacher] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.teacherA));
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
        name: "Timeline A",
        status: "active",
      },
      {
        id: classBId,
        schoolId: s.schoolA,
        schoolYearId: yearId,
        name: "Timeline B",
        status: "active",
      },
    ]);
    await tx.insert(students).values([
      { id: studentAId, schoolId: s.schoolA, fullName: "Timeline Student A" },
      { id: studentBId, schoolId: s.schoolA, fullName: "Timeline Student B" },
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
    await tx.insert(teacherAssignments).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      teacherId: teacher!.id,
      classId: classAId,
      status: "active",
    });
    return { classAId, classBId, studentAId, studentBId };
  });
  return {
    ...fixture,
    adminToken: await login(s.adminA),
    otherToken: await login(s.adminB),
    teacherToken: await login(s.teacherA),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  await withTenant(s.schoolA, async (tx) => {
    await tx
      .delete(timelineEditHistory)
      .where(eq(timelineEditHistory.schoolId, s.schoolA));
    await tx.delete(timelineMedia).where(eq(timelineMedia.schoolId, s.schoolA));
    await tx.delete(timelineTags).where(eq(timelineTags.schoolId, s.schoolA));
    await tx.delete(timelinePosts).where(eq(timelinePosts.schoolId, s.schoolA));
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
    .where(inArray(users.globalPhone, [s.adminA, s.adminB, s.teacherA]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

test("teacher can create a class post with tags and media", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/school/timeline", {
      method: "POST",
      headers: headers(fixture.teacherToken),
      body: JSON.stringify({
        type: "class",
        classId: fixture.classAId,
        content: "Class activity today",
        tags: [fixture.studentAId],
        media: [
          {
            fileUrl: "https://cdn.example/activity.jpg",
            fileType: "image",
            fileName: "activity.jpg",
            fileSize: 1024,
          },
        ],
      }),
    });
    expect(response.status).toBe(201);
    const postId = ((await response.json()) as { data: { id: string } }).data
      .id;
    const [post] = await withTenant(s.schoolA, (tx) =>
      tx.select().from(timelinePosts).where(eq(timelinePosts.id, postId)),
    );
    const tags = await withTenant(s.schoolA, (tx) =>
      tx.select().from(timelineTags).where(eq(timelineTags.postId, postId)),
    );
    const media = await withTenant(s.schoolA, (tx) =>
      tx.select().from(timelineMedia).where(eq(timelineMedia.postId, postId)),
    );
    expect(post?.type).toBe("class");
    expect(tags).toHaveLength(1);
    expect(media).toHaveLength(1);

    const listed = await app.request(
      `/api/v1/school/timeline/class/${fixture.classAId}`,
      { headers: { authorization: `Bearer ${fixture.teacherToken}` } },
    );
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { data: Array<{ id: string }> }).data[0]?.id,
    ).toBe(postId);
  } finally {
    await cleanup(s);
  }
});

test("teacher can create a child post for a student in the assigned class", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/school/timeline", {
      method: "POST",
      headers: headers(fixture.teacherToken),
      body: JSON.stringify({
        type: "child",
        studentId: fixture.studentAId,
        content: "Individual progress update",
      }),
    });
    expect(response.status).toBe(201);
  } finally {
    await cleanup(s);
  }
});

test("teacher cannot post to a class that is not assigned", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const response = await app.request("/api/v1/school/timeline", {
      method: "POST",
      headers: headers(fixture.teacherToken),
      body: JSON.stringify({
        type: "class",
        classId: fixture.classBId,
        content: "Unauthorized class post",
      }),
    });
    expect(response.status).toBe(403);
  } finally {
    await cleanup(s);
  }
});

test("updating a post records edit history", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const created = await app.request("/api/v1/school/timeline", {
      method: "POST",
      headers: headers(fixture.teacherToken),
      body: JSON.stringify({
        type: "child",
        studentId: fixture.studentAId,
        content: "Before edit",
      }),
    });
    const postId = ((await created.json()) as { data: { id: string } }).data.id;
    const updated = await app.request(`/api/v1/school/timeline/${postId}`, {
      method: "PUT",
      headers: headers(fixture.teacherToken),
      body: JSON.stringify({ content: "After edit" }),
    });
    expect(updated.status).toBe(200);
    const [history] = await withTenant(s.schoolA, (tx) =>
      tx
        .select()
        .from(timelineEditHistory)
        .where(eq(timelineEditHistory.postId, postId)),
    );
    expect(history).toMatchObject({
      oldContent: "Before edit",
      newContent: "After edit",
    });
  } finally {
    await cleanup(s);
  }
});

test("student timeline includes child posts and tagged class posts", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    for (const body of [
      {
        type: "class",
        classId: fixture.classAId,
        content: "Tagged class update",
        tags: [fixture.studentAId],
      },
      {
        type: "child",
        studentId: fixture.studentAId,
        content: "Child update",
      },
    ]) {
      const response = await app.request("/api/v1/school/timeline", {
        method: "POST",
        headers: headers(fixture.teacherToken),
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
    }
    const listed = await app.request(
      `/api/v1/school/timeline/student/${fixture.studentAId}`,
      { headers: { authorization: `Bearer ${fixture.teacherToken}` } },
    );
    expect(listed.status).toBe(200);
    const data = (await listed.json()) as {
      data: Array<{ type: string; content: string }>;
    };
    expect(data.data).toHaveLength(2);
    expect(data.data.map((item) => item.content)).toEqual(
      expect.arrayContaining(["Tagged class update", "Child update"]),
    );
  } finally {
    await cleanup(s);
  }
});
