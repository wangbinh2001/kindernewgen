import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  attendance,
  auditLogs,
  classes,
  classStudents,
  feeSchedules,
  schoolMemberships,
  schools,
  schoolYears,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { createAccessToken } from "../../src/auth/jwt";

test("audit log records changes for student edit, tuition, attendance, and staff management", async () => {
  const suffix = crypto.randomUUID();
  const schoolId = `school-audit-${suffix}`;
  const phone = `0988${suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;

  await db.insert(schools).values({ id: schoolId, name: `School Audit ${suffix}` });

  const [adminUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      globalPhone: phone,
      passwordHash: "hash",
      status: "active",
      displayName: "Admin Audit",
    })
    .returning();

  const [membership] = await db
    .insert(schoolMemberships)
    .values({
      id: crypto.randomUUID(),
      schoolId,
      userId: adminUser!.id,
      role: "school_admin",
    })
    .returning();

  const token = await createAccessToken({
    sub: adminUser!.id,
    school_id: schoolId,
    membership_id: membership!.id,
    role: "school_admin",
    session_version: 1,
  });

  // 1. Sửa học sinh -> kiểm tra audit log (actor, IP, before, after)
  const studentId = crypto.randomUUID();
  await withTenant(schoolId, async (tx) => {
    await tx.insert(students).values({
      id: studentId,
      schoolId,
      fullName: "Học sinh Audit Ban đầu",
      status: "active",
      dob: "2020-01-01",
      gender: "male",
      cccd: "079201999111",
    });
  });

  const updateRes = await app.request(`/api/v1/school/students/${studentId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.50",
    },
    body: JSON.stringify({
      fullName: "Học sinh Audit Đã Đổi Tên",
    }),
  });
  expect(updateRes.status).toBe(200);

  const studentLogs = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.schoolId, schoolId), eq(auditLogs.action, "student.update")));

  expect(studentLogs.length).toBe(1);
  expect(studentLogs[0]!.actorId).toBe(adminUser!.id);
  expect(studentLogs[0]!.ipAddress).toBe("192.168.1.50");
  const studentMeta = studentLogs[0]!.metadata as any;
  expect(studentMeta.before.fullName).toBe("Học sinh Audit Ban đầu");
  expect(studentMeta.after.fullName).toBe("Học sinh Audit Đã Đổi Tên");

  // 2. Học phí (Fee schedule) -> kiểm tra audit log
  const feeRes = await app.request("/api/v1/school/fees", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.51",
    },
    body: JSON.stringify({
      name: "Phí Dã Ngoại",
      amount: 150000,
      type: "basic",
    }),
  });
  expect(feeRes.status).toBe(201);

  const feeLogs = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.schoolId, schoolId), eq(auditLogs.action, "create_fee_schedule")));

  expect(feeLogs.length).toBe(1);
  expect(feeLogs[0]!.actorId).toBe(adminUser!.id);
  expect(feeLogs[0]!.ipAddress).toBe("192.168.1.51");
  expect((feeLogs[0]!.metadata as any).after.name).toBe("Phí Dã Ngoại");

  // 3. Điểm danh QR check-in & check-out -> kiểm tra audit log
  const classId = `class-${suffix}`;
  const schoolYearId = `sy-${suffix}`;
  await withTenant(schoolId, async (tx) => {
    await tx.insert(schoolYears).values({
      id: schoolYearId,
      schoolId,
      name: "2026-2027",
      startDate: "2026-09-01",
      endDate: "2027-05-31",
    });
    await tx.insert(classes).values({
      id: classId,
      schoolId,
      schoolYearId,
      name: "Lớp Mầm Audit",
    });
    await tx.insert(classStudents).values({
      id: crypto.randomUUID(),
      schoolId,
      classId,
      studentId,
      schoolYearId,
    });
  });

  const checkInRes = await app.request("/api/v1/school/attendance/qr-scan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.53",
    },
    body: JSON.stringify({
      studentId,
      type: "check_in",
      timestamp: "07:30",
      date: "2026-09-15",
    }),
  });
  expect(checkInRes.status).toBe(200);

  const checkInLogs = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.schoolId, schoolId), eq(auditLogs.action, "qr_check_in")));
  expect(checkInLogs.length).toBe(1);
  expect(checkInLogs[0]!.actorId).toBe(adminUser!.id);
  expect(checkInLogs[0]!.ipAddress).toBe("192.168.1.53");
  expect((checkInLogs[0]!.metadata as any).after.checkInTime).toBe("07:30");

  const checkOutRes = await app.request("/api/v1/school/attendance/qr-scan", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.54",
    },
    body: JSON.stringify({
      studentId,
      type: "check_out",
      timestamp: "18:30",
      date: "2026-09-15",
    }),
  });
  expect(checkOutRes.status).toBe(200);

  const checkOutLogs = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.schoolId, schoolId), eq(auditLogs.action, "qr_check_out")));
  expect(checkOutLogs.length).toBe(1);
  expect(checkOutLogs[0]!.actorId).toBe(adminUser!.id);
  expect(checkOutLogs[0]!.ipAddress).toBe("192.168.1.54");
  const checkOutMeta = checkOutLogs[0]!.metadata as any;
  expect(checkOutMeta.after.checkOutTime).toBe("18:30");
  expect(checkOutMeta.after.overtimeHours).toBe("1.50");

  // 4. Phân quyền / Trạng thái nhân viên (Staff) -> kiểm tra audit log
  const teacherPhone = `0911${suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;
  const staffCreateRes = await app.request("/api/v1/school/staff", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.55",
    },
    body: JSON.stringify({
      globalPhone: teacherPhone,
      displayName: "Cô Giáo Audit",
      role: "teacher",
    }),
  });
  expect(staffCreateRes.status).toBe(201);
  const staffData = (await staffCreateRes.json()) as any;
  const teacherMembershipId = staffData.data.membershipId;

  const staffCreateLogs = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.schoolId, schoolId), eq(auditLogs.action, "create_staff")));
  expect(staffCreateLogs.length).toBe(1);
  expect(staffCreateLogs[0]!.actorId).toBe(adminUser!.id);
  expect(staffCreateLogs[0]!.ipAddress).toBe("192.168.1.55");
  expect((staffCreateLogs[0]!.metadata as any).after.status).toBe("active");

  const staffStatusRes = await app.request(`/api/v1/school/staff/${teacherMembershipId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.56",
    },
    body: JSON.stringify({
      status: "locked",
    }),
  });
  expect(staffStatusRes.status).toBe(200);

  const staffStatusLogs = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.schoolId, schoolId), eq(auditLogs.action, "update_staff_status")));
  expect(staffStatusLogs.length).toBe(1);
  expect(staffStatusLogs[0]!.actorId).toBe(adminUser!.id);
  expect(staffStatusLogs[0]!.ipAddress).toBe("192.168.1.56");
  const staffStatusMeta = staffStatusLogs[0]!.metadata as any;
  expect(staffStatusMeta.before.status).toBe("active");
  expect(staffStatusMeta.after.status).toBe("locked");

  // Cleanup các bảng con trước khi xóa school
  await withTenant(schoolId, async (tx) => {
    await tx.delete(attendance).where(eq(attendance.schoolId, schoolId));
    await tx.delete(classStudents).where(eq(classStudents.schoolId, schoolId));
    await tx.delete(classes).where(eq(classes.schoolId, schoolId));
    await tx.delete(schoolYears).where(eq(schoolYears.schoolId, schoolId));
    await tx.delete(feeSchedules).where(eq(feeSchedules.schoolId, schoolId));
    await tx.delete(students).where(eq(students.schoolId, schoolId));
  });
  await db.delete(schoolMemberships).where(eq(schoolMemberships.schoolId, schoolId));
  await db.delete(users).where(inArray(users.globalPhone, [phone, teacherPhone]));

  // Cleanup: Xóa trường, kiểm tra audit log vẫn tồn tại an toàn nhờ trigger ON DELETE SET NULL
  await db.delete(schools).where(eq(schools.id, schoolId));
  const remainingLogs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, studentId));
  expect(remainingLogs.length).toBe(1);
  expect(remainingLogs[0]!.schoolId).toBeNull();
});
