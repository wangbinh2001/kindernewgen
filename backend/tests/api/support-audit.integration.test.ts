import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { verifyAccessToken } from "../../src/auth/jwt";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  schoolMemberships,
  schools,
  supportRequests,
  systemAdmins,
  users,
} from "../../src/db/schema";

async function createAdmin() {
  const [admin] = await db
    .insert(systemAdmins)
    .values({
      id: crypto.randomUUID(),
      username: `support-admin-${crypto.randomUUID()}`,
      passwordHash: await Bun.password.hash("Admin#123", {
        algorithm: "argon2id",
      }),
      displayName: "Support Admin",
    })
    .returning();
  return admin!;
}

async function loginAdmin(username: string) {
  const response = await app.request("/api/v1/auth/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "Admin#123" }),
  });
  return ((await response.json()) as { data: { token: string } }).data.token;
}

async function purgeAuditLogsForRequest(requestId: string) {
  const maintenance = postgres(process.env.MIGRATION_DATABASE_URL!);
  await maintenance`alter table audit_logs disable trigger audit_logs_append_only`;
  try {
    await maintenance`delete from audit_logs where support_session_id = ${requestId}`;
  } finally {
    await maintenance`alter table audit_logs enable trigger audit_logs_append_only`;
    await maintenance.end();
  }
}

test("school admin can request support and system admin can start read-only support", async () => {
  const schoolId = `test-support-school-${crypto.randomUUID()}`;
  const phone = `091${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`;
  const admin = await createAdmin();
  let userId: string | undefined;
  let requestId: string | undefined;
  try {
    await db
      .insert(schools)
      .values({ id: schoolId, name: `Support School ${schoolId}` });
    const registered = await registerParent({
      phone,
      schoolId,
      displayName: "School Admin",
    });
    userId = registered.user.id;
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(eq(schoolMemberships.userId, registered.user.id));

    const tenantLogin = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, password: "123456" }),
    });
    const tenantToken = (
      (await tenantLogin.json()) as { data: { token: string } }
    ).data.token;
    const requestResponse = await app.request(
      "/api/v1/school/support/requests",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tenantToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Need help",
          reason: "Investigate attendance issue",
        }),
      },
    );
    expect(requestResponse.status).toBe(201);
    const request = (await requestResponse.json()) as { data: { id: string } };
    requestId = request.data.id;

    const adminToken = await loginAdmin(admin.username);
    const approve = await app.request(
      `/api/v1/system/support/requests/${request.data.id}/approve`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${adminToken}` },
      },
    );
    expect(approve.status).toBe(200);
    expect(
      ((await approve.json()) as { data: { status: string } }).data.status,
    ).toBe("approved");

    const start = await app.request("/api/v1/system/support/session/start", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ supportRequestId: request.data.id }),
    });
    expect(start.status).toBe(200);
    const supportToken = ((await start.json()) as { data: { token: string } })
      .data.token;
    expect(await verifyAccessToken(supportToken)).toMatchObject({
      role: "system_admin",
      scope: "read_only",
      school_id: schoolId,
      support_session_id: request.data.id,
    });

    const read = await app.request("/api/v1/school/dashboard/stats", {
      headers: { authorization: `Bearer ${supportToken}` },
    });
    expect(read.status).toBe(200);

    const readStudents = await app.request("/api/v1/school/students", {
      headers: { authorization: `Bearer ${supportToken}` },
    });
    expect(readStudents.status).toBe(200);

    const write = await app.request("/api/v1/school/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${supportToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(write.status).toBe(403);

    const end = await app.request("/api/v1/system/support/session/end", {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ supportRequestId: request.data.id }),
    });
    expect(end.status).toBe(200);

    const revoked = await app.request("/api/v1/school/dashboard/stats", {
      headers: { authorization: `Bearer ${supportToken}` },
    });
    expect(revoked.status).toBe(401);
  } finally {
    if (requestId) {
      await purgeAuditLogsForRequest(requestId);
      await db.delete(supportRequests).where(eq(supportRequests.id, requestId));
    }
    if (userId) {
      await db
        .delete(schoolMemberships)
        .where(eq(schoolMemberships.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(systemAdmins).where(eq(systemAdmins.id, admin.id));
  }
});

test("support request actions are visible in filtered audit logs", async () => {
  const schoolId = `test-support-school-${crypto.randomUUID()}`;
  const phone = `091${crypto.randomUUID().replace(/\D/g, "").slice(0, 7)}`;
  const admin = await createAdmin();
  let userId: string | undefined;
  let requestId: string | undefined;
  try {
    await db
      .insert(schools)
      .values({ id: schoolId, name: `Audit School ${schoolId}` });
    const registered = await registerParent({
      phone,
      schoolId,
      displayName: "School Admin",
    });
    userId = registered.user.id;
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(eq(schoolMemberships.userId, registered.user.id));
    const tenantLogin = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, password: "123456" }),
    });
    const tenantToken = (
      (await tenantLogin.json()) as { data: { token: string } }
    ).data.token;
    const requestResponse = await app.request(
      "/api/v1/school/support/requests",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tenantToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Audit me", reason: "Need a review" }),
      },
    );
    const request = (await requestResponse.json()) as { data: { id: string } };
    requestId = request.data.id;
    const adminToken = await loginAdmin(admin.username);
    await app.request(
      `/api/v1/system/support/requests/${request.data.id}/approve`,
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${adminToken}` },
      },
    );

    const logs = await app.request(
      `/api/v1/system/audit-logs?schoolId=${schoolId}&page=1&limit=2`,
      {
        headers: { authorization: `Bearer ${adminToken}` },
      },
    );
    expect(logs.status).toBe(200);
    const body = (await logs.json()) as {
      data: { items: Array<{ action: string }>; total: number };
    };
    expect(body.data.total).toBeGreaterThanOrEqual(2);
    expect(body.data.items.length).toBe(2);
    expect(body.data.items.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        "support_request_created",
        "support_request_approved",
      ]),
    );
  } finally {
    if (requestId) {
      await purgeAuditLogsForRequest(requestId);
      await db.delete(supportRequests).where(eq(supportRequests.id, requestId));
    }
    if (userId) {
      await db
        .delete(schoolMemberships)
        .where(eq(schoolMemberships.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await db.delete(schools).where(eq(schools.id, schoolId));
    await db.delete(systemAdmins).where(eq(systemAdmins.id, admin.id));
  }
});
