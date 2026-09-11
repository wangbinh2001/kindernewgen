import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  notifications,
  parentChildren,
  parentRequestAttachments,
  parentRequestHistory,
  parentRequests,
  schoolMemberships,
  schools,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-notifications-a-${id}`,
    schoolB: `test-notifications-b-${id}`,
    phoneA: `0917${digits}`,
    phoneB: `0928${digits}`,
    adminA: `0939${digits}`,
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
  await registerParent({
    phone: s.phoneA,
    schoolId: s.schoolA,
    displayName: "Parent A",
  });
  await registerParent({
    phone: s.phoneB,
    schoolId: s.schoolB,
    displayName: "Parent B",
  });
  await registerParent({
    phone: s.adminA,
    schoolId: s.schoolA,
    displayName: "School Admin A",
  });
  const [userA] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.phoneA));
  const [userB] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.phoneB));
  const [adminA] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.adminA));
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(
      and(
        eq(schoolMemberships.userId, adminA!.id),
        eq(schoolMemberships.schoolId, s.schoolA),
      ),
    );
  return {
    userA: userA!,
    userB: userB!,
    adminA: adminA!,
    tokenA: await login(s.phoneA),
    tokenB: await login(s.phoneB),
    adminTokenA: await login(s.adminA),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.phoneA, s.phoneB, s.adminA]));
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, (tx) =>
      tx.delete(notifications).where(eq(notifications.schoolId, schoolId)),
    );
  }
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("notifications list only the current user's unread notifications", async () => {
  const s = scenario();
  try {
    const { userA, tokenA, userB } = await setup(s);
    await withTenant(s.schoolA, (tx) =>
      tx.insert(notifications).values([
        {
          id: crypto.randomUUID(),
          schoolId: s.schoolA,
          recipientId: userA.id,
          type: "attendance",
          title: "Điểm danh",
          message: "Con đã được điểm danh hôm nay",
          entityType: "attendance",
          entityId: "attendance-1",
        },
        {
          id: crypto.randomUUID(),
          schoolId: s.schoolA,
          recipientId: userB.id,
          type: "private",
          title: "Không được thấy",
          message: "Thông báo của user khác",
        },
      ]),
    );
    const response = await app.request("/api/v1/notifications", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ recipientId: string }>; unreadCount: number };
    };
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]?.recipientId).toBe(userA.id);
    expect(body.data.unreadCount).toBe(1);
  } finally {
    await cleanup(s);
  }
});

test("a user can mark one notification and then all notifications as read", async () => {
  const s = scenario();
  try {
    const { userA, tokenA } = await setup(s);
    const rows = await withTenant(s.schoolA, (tx) =>
      tx
        .insert(notifications)
        .values([
          {
            id: crypto.randomUUID(),
            schoolId: s.schoolA,
            recipientId: userA.id,
            type: "tuition",
            title: "Học phí",
            message: "Có học phí mới",
          },
          {
            id: crypto.randomUUID(),
            schoolId: s.schoolA,
            recipientId: userA.id,
            type: "timeline",
            title: "Hoạt động",
            message: "Có bài đăng mới",
          },
        ])
        .returning(),
    );
    const first = rows[0]!;
    const read = await app.request(`/api/v1/notifications/${first.id}/read`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(read.status).toBe(200);
    const all = await app.request("/api/v1/notifications/read-all", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(all.status).toBe(200);
    const response = await app.request(
      "/api/v1/notifications?unreadOnly=true",
      {
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { data: { items: unknown[] } }).data.items,
    ).toHaveLength(0);
  } finally {
    await cleanup(s);
  }
});

test("parent requests notify school admins", async () => {
  const s = scenario();
  const childId = crypto.randomUUID();
  try {
    const { userA, tokenA, adminTokenA } = await setup(s);
    await withTenant(s.schoolA, async (tx) => {
      await tx.insert(students).values({
        id: childId,
        schoolId: s.schoolA,
        fullName: "Notification Child",
      });
      await tx.insert(parentChildren).values({
        id: crypto.randomUUID(),
        parentId: userA.id,
        childId,
      });
    });
    const created = await app.request("/api/v1/parent/requests", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        childId,
        type: "absence",
        content: "Con nghỉ học hôm nay",
      }),
    });
    expect(created.status).toBe(201);
    const response = await app.request("/api/v1/notifications", {
      headers: { authorization: `Bearer ${adminTokenA}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ type: string; entityId: string }> };
    };
    expect(body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "parent_request" }),
      ]),
    );
  } finally {
    await withTenant(s.schoolA, async (tx) => {
      const requests = await tx
        .select({ id: parentRequests.id })
        .from(parentRequests)
        .where(eq(parentRequests.childId, childId));
      for (const request of requests) {
        await tx
          .delete(parentRequestAttachments)
          .where(eq(parentRequestAttachments.requestId, request.id));
        await tx
          .delete(parentRequestHistory)
          .where(eq(parentRequestHistory.requestId, request.id));
      }
      await tx
        .delete(parentRequests)
        .where(eq(parentRequests.childId, childId));
      await tx
        .delete(parentChildren)
        .where(eq(parentChildren.childId, childId));
      await tx.delete(students).where(eq(students.id, childId));
    });
    await cleanup(s);
  }
});

test("notification APIs cannot read or mutate another tenant's notification", async () => {
  const s = scenario();
  try {
    const { userA, tokenA, tokenB } = await setup(s);
    const [notification] = await withTenant(s.schoolA, (tx) =>
      tx
        .insert(notifications)
        .values({
          id: crypto.randomUUID(),
          schoolId: s.schoolA,
          recipientId: userA.id,
          type: "request",
          title: "Yêu cầu",
          message: "Yêu cầu mới",
        })
        .returning(),
    );
    const list = await app.request("/api/v1/notifications", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(list.status).toBe(200);
    expect(
      ((await list.json()) as { data: { items: unknown[] } }).data.items,
    ).toHaveLength(0);
    const read = await app.request(
      `/api/v1/notifications/${notification!.id}/read`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${tokenB}` },
      },
    );
    expect(read.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
