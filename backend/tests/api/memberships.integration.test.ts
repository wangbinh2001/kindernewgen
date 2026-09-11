import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  auditLogs,
  classes,
  schoolMemberships,
  schools,
  schoolYears,
  teacherAssignments,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { createAccessToken } from "../../src/auth/jwt";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `school-memb-a-${id}`,
    schoolB: `school-memb-b-${id}`,
    phoneAdminA: `0911${digits}`,
    phoneAdminB: `0922${digits}`,
    phoneTeacher: `0933${digits}`,
    phoneStaff: `0944${digits}`,
    phoneMulti: `0955${digits}`,
  };
}

async function createTestUser(phone: string, displayName: string) {
  const [user] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      globalPhone: phone,
      passwordHash: "hash-secret",
      status: "active",
      displayName,
      email: `${phone}@test.com`,
    })
    .returning();
  return user!;
}

async function createMembership(
  schoolId: string,
  userId: string,
  role: "school_admin" | "teacher" | "staff" | "parent",
  status: "active" | "locked" | "revoked" = "active",
) {
  const [membership] = await db
    .insert(schoolMemberships)
    .values({
      id: crypto.randomUUID(),
      schoolId,
      userId,
      role,
      status,
    })
    .returning();
  return membership!;
}

async function tokenFor(
  user: typeof users.$inferSelect,
  membership: typeof schoolMemberships.$inferSelect,
) {
  return await createAccessToken({
    sub: user.id,
    school_id: membership.schoolId,
    membership_id: membership.id,
    role: membership.role as any,
    session_version: user.sessionVersion,
  });
}

test("School Membership Management: listing, filtering, pagination, and data protection", async () => {
  const s = scenario();
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);

  const adminAUser = await createTestUser(s.phoneAdminA, "Admin Alpha");
  const adminAMemb = await createMembership(s.schoolA, adminAUser.id, "school_admin");
  const tokenAdminA = await tokenFor(adminAUser, adminAMemb);

  const teacherUser = await createTestUser(s.phoneTeacher, "Teacher John");
  const teacherMemb = await createMembership(s.schoolA, teacherUser.id, "teacher");
  const tokenTeacher = await tokenFor(teacherUser, teacherMemb);

  const staffUser = await createTestUser(s.phoneStaff, "Staff Mary");
  const staffMemb = await createMembership(s.schoolA, staffUser.id, "staff", "locked");

  try {
    // 1. Non-admin (teacher) is forbidden from listing members (403)
    const forbiddenList = await app.request("/api/v1/school/members", {
      headers: { authorization: `Bearer ${tokenTeacher}` },
    });
    expect(forbiddenList.status).toBe(403);

    // 2. Admin can list members
    const listRes = await app.request("/api/v1/school/members", {
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as any;
    expect(listJson.success).toBe(true);
    expect(listJson.data.items.length).toBe(3);
    expect(listJson.data.total).toBe(3);

    // 3. Sensitive fields must NOT be leaked
    for (const item of listJson.data.items) {
      expect(item.passwordHash).toBeUndefined();
      expect(item.sessionVersion).toBeUndefined();
      expect(item.membershipId).toBeDefined();
      expect(item.userId).toBeDefined();
      expect(item.displayName).toBeDefined();
    }

    // 4. Filter by role
    const filterRole = await app.request("/api/v1/school/members?role=teacher", {
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    const filterRoleJson = (await filterRole.json()) as any;
    expect(filterRoleJson.data.items.length).toBe(1);
    expect(filterRoleJson.data.items[0].displayName).toBe("Teacher John");

    // 5. Filter by status
    const filterStatus = await app.request("/api/v1/school/members?status=locked", {
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    const filterStatusJson = (await filterStatus.json()) as any;
    expect(filterStatusJson.data.items.length).toBe(1);
    expect(filterStatusJson.data.items[0].displayName).toBe("Staff Mary");

    // 6. Search by name or phone
    const searchRes = await app.request(`/api/v1/school/members?search=${s.phoneTeacher}`, {
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    const searchJson = (await searchRes.json()) as any;
    expect(searchJson.data.items.length).toBe(1);
    expect(searchJson.data.items[0].displayName).toBe("Teacher John");

    // 7. Pagination
    const pageRes = await app.request("/api/v1/school/members?page=1&limit=2", {
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    const pageJson = (await pageRes.json()) as any;
    expect(pageJson.data.items.length).toBe(2);
    expect(pageJson.data.total).toBe(3);
    expect(pageJson.data.page).toBe(1);
    expect(pageJson.data.limit).toBe(2);
  } finally {
    await db.delete(schoolMemberships).where(inArray(schoolMemberships.schoolId, [s.schoolA, s.schoolB]));
    await db.delete(users).where(inArray(users.id, [adminAUser.id, teacherUser.id, staffUser.id]));
    await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
  }
});

test("School Membership Management: detail, cross-tenant isolation, role change and teacher cleanup", async () => {
  const s = scenario();
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);

  const adminAUser = await createTestUser(s.phoneAdminA, "Admin Alpha");
  const adminAMemb = await createMembership(s.schoolA, adminAUser.id, "school_admin");
  const tokenAdminA = await tokenFor(adminAUser, adminAMemb);

  const adminBUser = await createTestUser(s.phoneAdminB, "Admin Beta");
  const adminBMemb = await createMembership(s.schoolB, adminBUser.id, "school_admin");
  const tokenAdminB = await tokenFor(adminBUser, adminBMemb);

  const teacherUser = await createTestUser(s.phoneTeacher, "Teacher Jane");
  const teacherMemb = await createMembership(s.schoolA, teacherUser.id, "teacher");

  // Create schoolYear and class in School A assigned to teacher
  const { sy, cls, assignment } = await withTenant(s.schoolA, async (tx) => {
    const [insertedSy] = await tx
      .insert(schoolYears)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        name: `SY-${s.schoolA}`,
        startDate: "2026-09-01",
        endDate: "2027-05-31",
      })
      .returning();

    const [insertedCls] = await tx
      .insert(classes)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        schoolYearId: insertedSy!.id,
        name: "Class Sun",
        teacherId: teacherUser.id,
        maxStudents: 25,
        status: "active",
      })
      .returning();

    const [insertedAssign] = await tx
      .insert(teacherAssignments)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        teacherId: teacherUser.id,
        classId: insertedCls!.id,
        status: "active",
      })
      .returning();

    return { sy: insertedSy!, cls: insertedCls!, assignment: insertedAssign! };
  });

  try {
    // 1. GET detail in tenant
    const detailA = await app.request(`/api/v1/school/members/${teacherMemb.id}`, {
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    expect(detailA.status).toBe(200);
    const detailJson = (await detailA.json()) as any;
    expect(detailJson.data.membershipId).toBe(teacherMemb.id);
    expect(detailJson.data.role).toBe("teacher");
    expect(detailJson.data.passwordHash).toBeUndefined();
    expect(detailJson.data.teacherAssignments.length).toBe(1);
    expect(detailJson.data.teacherAssignments[0].classId).toBe(cls!.id);

    // 2. Cross-tenant GET detail returns 404
    const crossDetail = await app.request(`/api/v1/school/members/${teacherMemb.id}`, {
      headers: { authorization: `Bearer ${tokenAdminB}` },
    });
    expect(crossDetail.status).toBe(404);

    // 3. Last school_admin protection: cannot change role of sole admin
    const demoteLastAdmin = await app.request(`/api/v1/school/members/${adminAMemb.id}/role`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${tokenAdminA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "teacher" }),
    });
    expect(demoteLastAdmin.status).toBe(400);

    // 4. Change role teacher -> staff: should archive assignment and clear classes.teacherId
    const changeRole = await app.request(`/api/v1/school/members/${teacherMemb.id}/role`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${tokenAdminA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "staff" }),
    });
    expect(changeRole.status).toBe(200);
    const changeJson = (await changeRole.json()) as any;
    expect(changeJson.data.role).toBe("staff");

    // Verify teacher assignments archived and classes.teacherId cleared inside tenant
    await withTenant(s.schoolA, async (tx) => {
      const updatedAssign = await tx
        .select()
        .from(teacherAssignments)
        .where(eq(teacherAssignments.id, assignment!.id));
      expect(updatedAssign[0]!.status).toBe("archived");

      const updatedClass = await tx
        .select()
        .from(classes)
        .where(eq(classes.id, cls!.id));
      expect(updatedClass[0]!.teacherId).toBeNull();
    });

    // Verify audit log recorded for role update
    const roleAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.schoolId, s.schoolA),
          eq(auditLogs.action, "membership.role_update"),
          eq(auditLogs.targetId, teacherMemb.id),
        ),
      );
    expect(roleAudits.length).toBe(1);
    expect((roleAudits[0]!.metadata as any).before.role).toBe("teacher");
    expect((roleAudits[0]!.metadata as any).after.role).toBe("staff");
  } finally {
    await withTenant(s.schoolA, async (tx) => {
      await tx.delete(teacherAssignments).where(eq(teacherAssignments.schoolId, s.schoolA));
      await tx.delete(classes).where(eq(classes.schoolId, s.schoolA));
      await tx.delete(schoolYears).where(eq(schoolYears.schoolId, s.schoolA));
    });
    await db.delete(schoolMemberships).where(inArray(schoolMemberships.schoolId, [s.schoolA, s.schoolB]));
    await db.delete(users).where(inArray(users.id, [adminAUser.id, adminBUser.id, teacherUser.id]));
    await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
  }
});

test("School Membership Management: status lock/unlock, last admin guard, token rejection", async () => {
  const s = scenario();
  await db.insert(schools).values([{ id: s.schoolA, name: s.schoolA }]);

  const adminAUser = await createTestUser(s.phoneAdminA, "Admin Alpha");
  const adminAMemb = await createMembership(s.schoolA, adminAUser.id, "school_admin");
  const tokenAdminA = await tokenFor(adminAUser, adminAMemb);

  const teacherUser = await createTestUser(s.phoneTeacher, "Teacher Active");
  const teacherMemb = await createMembership(s.schoolA, teacherUser.id, "teacher");
  const tokenTeacher = await tokenFor(teacherUser, teacherMemb);

  try {
    // 1. Cannot lock sole school_admin
    const lockAdmin = await app.request(`/api/v1/school/members/${adminAMemb.id}/status`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${tokenAdminA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "locked" }),
    });
    expect(lockAdmin.status).toBe(400);

    // 2. Lock teacher membership
    const lockTeacher = await app.request(`/api/v1/school/members/${teacherMemb.id}/status`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${tokenAdminA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "locked" }),
    });
    expect(lockTeacher.status).toBe(200);

    // 3. Locked membership's token is immediately rejected with 401 by middleware
    const lockedAccess = await app.request("/api/v1/school/classes", {
      headers: { authorization: `Bearer ${tokenTeacher}` },
    });
    expect(lockedAccess.status).toBe(401);

    // 4. Unlock teacher membership
    const unlockTeacher = await app.request(`/api/v1/school/members/${teacherMemb.id}/status`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${tokenAdminA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "active" }),
    });
    expect(unlockTeacher.status).toBe(200);

    // 5. Unlocked membership works again with the same valid token
    const restoredAccess = await app.request("/api/v1/school/classes", {
      headers: { authorization: `Bearer ${tokenTeacher}` },
    });
    expect(restoredAccess.status).toBe(200);

    // Verify audit logs for status changes
    const statusAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.schoolId, s.schoolA),
          eq(auditLogs.action, "membership.status_update"),
          eq(auditLogs.targetId, teacherMemb.id),
        ),
      );
    expect(statusAudits.length).toBe(2);
  } finally {
    await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, s.schoolA));
    await db.delete(users).where(inArray(users.id, [adminAUser.id, teacherUser.id]));
    await db.delete(schools).where(eq(schools.id, s.schoolA));
  }
});

test("School Membership Management: DELETE revoke membership, multi-school isolation, user retention", async () => {
  const s = scenario();
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);

  const adminAUser = await createTestUser(s.phoneAdminA, "Admin A");
  const adminAMemb = await createMembership(s.schoolA, adminAUser.id, "school_admin");
  const tokenAdminA = await tokenFor(adminAUser, adminAMemb);

  // User with memberships in BOTH School A and School B
  const multiUser = await createTestUser(s.phoneMulti, "Multi School Teacher");
  const membInA = await createMembership(s.schoolA, multiUser.id, "teacher");
  const membInB = await createMembership(s.schoolB, multiUser.id, "teacher");
  const tokenMultiB = await tokenFor(multiUser, membInB);

  try {
    // 1. Cannot delete last school_admin
    const delAdmin = await app.request(`/api/v1/school/members/${adminAMemb.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    expect(delAdmin.status).toBe(400);

    // 2. Revoke membership in School A
    const revokeRes = await app.request(`/api/v1/school/members/${membInA.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    expect(revokeRes.status).toBe(200);

    // 3. Check DB: membership in School A is soft-revoked
    const [rowA] = await db
      .select()
      .from(schoolMemberships)
      .where(eq(schoolMemberships.id, membInA.id));
    expect(rowA!.status).toBe("revoked");

    // 4. Global user row must NOT be deleted
    const [userStillExists] = await db
      .select()
      .from(users)
      .where(eq(users.id, multiUser.id));
    expect(userStillExists).toBeDefined();

    // 5. Membership in School B remains active and unaffected
    const [rowB] = await db
      .select()
      .from(schoolMemberships)
      .where(eq(schoolMemberships.id, membInB.id));
    expect(rowB!.status).toBe("active");

    // 6. Token for School B remains valid
    const accessB = await app.request("/api/v1/school/classes", {
      headers: { authorization: `Bearer ${tokenMultiB}` },
    });
    expect(accessB.status).toBe(200);

    // 7. Revoke membership audit log exists
    const revokeAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.schoolId, s.schoolA),
          eq(auditLogs.action, "membership.revoke"),
          eq(auditLogs.targetId, membInA.id),
        ),
      );
    expect(revokeAudits.length).toBe(1);
  } finally {
    await db.delete(schoolMemberships).where(inArray(schoolMemberships.schoolId, [s.schoolA, s.schoolB]));
    await db.delete(users).where(inArray(users.id, [adminAUser.id, multiUser.id]));
    await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
  }
});

test("Staff class unassignment endpoint: DELETE /api/v1/school/staff/:id/assign-class/:classId", async () => {
  const s = scenario();
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);

  const adminAUser = await createTestUser(s.phoneAdminA, "Admin A");
  const adminAMemb = await createMembership(s.schoolA, adminAUser.id, "school_admin");
  const tokenAdminA = await tokenFor(adminAUser, adminAMemb);

  const adminBUser = await createTestUser(s.phoneAdminB, "Admin B");
  const adminBMemb = await createMembership(s.schoolB, adminBUser.id, "school_admin");
  const tokenAdminB = await tokenFor(adminBUser, adminBMemb);

  const teacherUser = await createTestUser(s.phoneTeacher, "Teacher Unassign");
  const teacherMemb = await createMembership(s.schoolA, teacherUser.id, "teacher");

  const { sy, cls, assignment } = await withTenant(s.schoolA, async (tx) => {
    const [insertedSy] = await tx
      .insert(schoolYears)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        name: `SY-Unassign-${s.schoolA}`,
        startDate: "2026-09-01",
        endDate: "2027-05-31",
      })
      .returning();

    const [insertedCls] = await tx
      .insert(classes)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        schoolYearId: insertedSy!.id,
        name: "Class Moon",
        teacherId: teacherUser.id,
        maxStudents: 20,
        status: "active",
      })
      .returning();

    const [insertedAssign] = await tx
      .insert(teacherAssignments)
      .values({
        id: crypto.randomUUID(),
        schoolId: s.schoolA,
        teacherId: teacherUser.id,
        classId: insertedCls!.id,
        status: "active",
      })
      .returning();

    return { sy: insertedSy!, cls: insertedCls!, assignment: insertedAssign! };
  });

  try {
    // 1. Cross-tenant unassign attempt is rejected with 404
    const crossUnassign = await app.request(
      `/api/v1/school/staff/${teacherUser.id}/assign-class/${cls!.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokenAdminB}` },
      },
    );
    expect(crossUnassign.status).toBe(404);

    // 2. Admin unassigns teacher from class (using userId)
    const unassignRes = await app.request(
      `/api/v1/school/staff/${teacherUser.id}/assign-class/${cls!.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokenAdminA}` },
      },
    );
    expect(unassignRes.status).toBe(200);

    // 3. Verify assignment status archived and class teacherId is null inside tenant
    await withTenant(s.schoolA, async (tx) => {
      const [updatedAssign] = await tx
        .select()
        .from(teacherAssignments)
        .where(eq(teacherAssignments.id, assignment!.id));
      expect(updatedAssign!.status).toBe("archived");

      const [updatedClass] = await tx
        .select()
        .from(classes)
        .where(eq(classes.id, cls!.id));
      expect(updatedClass!.teacherId).toBeNull();
    });

    // 5. Verify audit log
    const unassignAudits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.schoolId, s.schoolA),
          eq(auditLogs.action, "unassign_teacher_class"),
        ),
      );
    expect(unassignAudits.length).toBe(1);
  } finally {
    await withTenant(s.schoolA, async (tx) => {
      await tx.delete(teacherAssignments).where(eq(teacherAssignments.schoolId, s.schoolA));
      await tx.delete(classes).where(eq(classes.schoolId, s.schoolA));
      await tx.delete(schoolYears).where(eq(schoolYears.schoolId, s.schoolA));
    });
    await db.delete(schoolMemberships).where(inArray(schoolMemberships.schoolId, [s.schoolA, s.schoolB]));
    await db.delete(users).where(inArray(users.id, [adminAUser.id, adminBUser.id, teacherUser.id]));
    await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
  }
});
