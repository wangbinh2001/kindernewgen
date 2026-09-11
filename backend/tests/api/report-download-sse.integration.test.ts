import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/server";
import { db } from "../../src/db";
import { reportJobs, schoolMemberships, schools, systemAdmins, users } from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { createAccessToken, createContextSelectionToken, createSystemAdminToken } from "../../src/auth/jwt";
import { realtimeHub } from "../../src/realtime/sse";

test("completed report downloads as UTF-8 CSV and SSE requires auth", async () => {
  const suffix = crypto.randomUUID();
  const schoolId = `school-csv-${suffix}`;
  const phone = `0966${suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;
  await db.insert(schools).values({ id: schoolId, name: `School CSV ${suffix}` });
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(), globalPhone: phone, passwordHash: "hash", status: "active", displayName: "CSV Admin",
  }).returning();
  const [membership] = await db.insert(schoolMemberships).values({
    id: crypto.randomUUID(), schoolId, userId: user!.id, role: "school_admin",
  }).returning();
  const token = await createAccessToken({
    sub: user!.id, school_id: schoolId, membership_id: membership!.id, role: "school_admin", session_version: 1,
  });

  const [job] = await withTenant(schoolId, (tx) =>
    tx.insert(reportJobs).values({
      id: crypto.randomUUID(), schoolId, createdBy: user!.id, type: "tuition", status: "completed",
      result: {
        summary: { totalRecords: 1, totalFees: 2000000, totalReduction: 0, totalFinalAmount: 2000000, totalCollected: 0, outstanding: 2000000 },
        histories: [{ studentId: "student-1", studentName: "Bé Nguyễn", month: "2026-09-01", totalFees: 2000000, totalReduction: 0, finalAmount: 2000000, state: "confirmed" }],
      },
    }).returning(),
  );

  const download = await app.request(`/api/v1/school/reports/${job!.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toContain("text/csv");
  expect(download.headers.get("content-disposition")).toContain("attachment");
  const csv = await download.text();
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Bé Nguyễn");
  expect(csv).toContain("TỔNG CỘNG");

  const [notReady] = await withTenant(schoolId, (tx) =>
    tx.insert(reportJobs).values({
      id: crypto.randomUUID(), schoolId, createdBy: user!.id, type: "attendance", status: "processing",
    }).returning(),
  );
  const notReadyRes = await app.request(`/api/v1/school/reports/${notReady!.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(notReadyRes.status).toBe(409);

  // 1. Missing auth: 401
  const unauthorized = await app.request("/api/v1/realtime/stream");
  expect(unauthorized.status).toBe(401);

  // 2. Invalid or expired token: 401
  const invalidRes = await app.request("/api/v1/realtime/stream", {
    headers: { Authorization: "Bearer invalid.token.payload" },
  });
  expect(invalidRes.status).toBe(401);

  const expiredToken = await createAccessToken({
    sub: user!.id,
    school_id: schoolId,
    membership_id: membership!.id,
    role: "school_admin",
    session_version: 1,
    expiresIn: "-1s",
  });
  const expiredRes = await app.request("/api/v1/realtime/stream", {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  expect(expiredRes.status).toBe(401);

  // 3. SSE token guards: reject context_selection with 403
  const contextToken = await createContextSelectionToken({
    sub: user!.id,
    role: "context_selection",
    scope: "context_selection",
    session_version: 1,
  });
  const contextRes = await app.request("/api/v1/realtime/stream", {
    headers: { Authorization: `Bearer ${contextToken}` },
  });
  expect(contextRes.status).toBe(403);
  const contextBody = (await contextRes.json()) as any;
  expect(contextBody.error.code).toBe("FORBIDDEN");
  expect(contextBody.error.message).toBe("Tenant access token required");

  // 4. SSE token guards: reject system_admin without school_id with 403
  const [sysAdmin] = await db.insert(systemAdmins).values({
    id: crypto.randomUUID(),
    username: `sysadmin-${suffix}`,
    displayName: "SysAdmin Test",
    passwordHash: "hash",
    status: "active",
  }).returning();
  const sysAdminToken = await createSystemAdminToken({
    sub: sysAdmin!.id,
    role: "system_admin",
    session_version: 1,
  });
  const sysAdminRes = await app.request("/api/v1/realtime/stream", {
    headers: { Authorization: `Bearer ${sysAdminToken}` },
  });
  expect(sysAdminRes.status).toBe(403);
  const sysAdminBody = (await sysAdminRes.json()) as any;
  expect(sysAdminBody.error.code).toBe("FORBIDDEN");
  expect(sysAdminBody.error.message).toBe("Tenant access token required");

  // 5. Valid tenant token opens SSE stream successfully (200)
  const streamRes = await app.request("/api/v1/realtime/stream", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(streamRes.status).toBe(200);
  expect(streamRes.headers.get("content-type")).toContain("text/event-stream");
  // Cancel stream reader so connection finishes cleanly
  streamRes.body?.cancel();

  // 6. Realtime Hub and tenant isolation (no cross-tenant broadcast)
  const schoolBId = `school-b-${suffix}`;
  let receivedSchoolAEvent: any = null;
  let receivedSchoolBEvent: any = null;

  const unregisterA = realtimeHub.register({
    schoolId,
    userId: user!.id,
    send: (eventType, data) => {
      receivedSchoolAEvent = { eventType, data };
    },
  });

  const unregisterB = realtimeHub.register({
    schoolId: schoolBId,
    userId: "user-b",
    send: (eventType, data) => {
      receivedSchoolBEvent = { eventType, data };
    },
  });

  expect(realtimeHub.clientCount()).toBeGreaterThanOrEqual(2);

  // Send to School A
  realtimeHub.sendToSchool(schoolId, "school_notice", { notice: "School A only" });
  expect(receivedSchoolAEvent).not.toBeNull();
  expect(receivedSchoolAEvent.eventType).toBe("school_notice");
  expect(receivedSchoolAEvent.data.notice).toBe("School A only");
  // School B must NOT receive School A's event
  expect(receivedSchoolBEvent).toBeNull();

  // Send to User in School A
  realtimeHub.sendToUser(user!.id, "user_alert", { alert: "User A only" });
  expect(receivedSchoolAEvent.eventType).toBe("user_alert");
  expect(receivedSchoolBEvent).toBeNull();

  unregisterA();
  unregisterB();

  await withTenant(schoolId, (tx) =>
    tx.delete(reportJobs).where(eq(reportJobs.schoolId, schoolId)),
  );
  await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
  await db.delete(users).where(eq(users.id, user!.id));
  await db.delete(schools).where(eq(schools.id, schoolId));
  await db.delete(systemAdmins).where(eq(systemAdmins.id, sysAdmin!.id));
});
