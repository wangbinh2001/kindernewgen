import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  parentChildren,
  responsiblePersons,
  schoolMemberships,
  schools,
  studentProfiles,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const suffix = crypto.randomUUID();
  const digits = suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolId: `test-address-school-${suffix}`,
    phone: `0987${digits}`,
    parentPhone: `0906${digits}`,
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
  await db.insert(schools).values({ id: s.schoolId, name: s.schoolId });
  await registerParent({
    phone: s.phone,
    schoolId: s.schoolId,
    displayName: "Address Admin",
  });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.phone));
  await db
    .update(schoolMemberships)
    .set({ role: "school_admin" })
    .where(eq(schoolMemberships.userId, user!.id));
  return login(s.phone);
}

function studentPayload(s: ReturnType<typeof scenario>) {
  return {
    full_name: "Address Student",
    dob: "2020-01-02",
    gender: "female",
    cccd: crypto.randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12),
    responsiblePersons: [
      {
        type: "mother",
        fullName: "Address Parent",
        yearOfBirth: 1990,
        cccd: "079000000001",
        phone: s.parentPhone,
      },
    ],
    permanentProvince: "Thành phố Hà Nội",
    permanentCommune: "Phường Ba Đình",
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.phone));
  const tenantStudents = await withTenant(s.schoolId, (tx) =>
    tx.select({ id: students.id }).from(students),
  );
  const studentIds = tenantStudents.map((student) => student.id);
  if (studentIds.length > 0) {
    await db
      .delete(parentChildren)
      .where(eq(parentChildren.childId, studentIds[0]!));
    await withTenant(s.schoolId, async (tx) => {
      await tx
        .delete(studentProfiles)
        .where(eq(studentProfiles.schoolId, s.schoolId));
      await tx
        .delete(responsiblePersons)
        .where(eq(responsiblePersons.studentId, studentIds[0]!));
      await tx.delete(students).where(eq(students.schoolId, s.schoolId));
    });
  }
  const parent = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, s.parentPhone));
  for (const account of [user, ...parent]) {
    if (!account) continue;
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, account.id));
    await db.delete(users).where(eq(users.id, account.id));
  }
  await db.delete(schools).where(eq(schools.id, s.schoolId));
}

test("student address fields are persisted in student_profiles", async () => {
  const s = scenario();
  try {
    const token = await setup(s);
    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(studentPayload(s)),
    });
    expect(response.status).toBe(201);

    const [profile] = await withTenant(s.schoolId, (tx) =>
      tx.select().from(studentProfiles),
    );
    expect(profile).toMatchObject({
      schoolId: s.schoolId,
      permanentProvince: "Thành phố Hà Nội",
      permanentCommune: "Phường Ba Đình",
    });
  } finally {
    await cleanup(s);
  }
});

test("student creation rejects a commune outside the selected province", async () => {
  const s = scenario();
  try {
    const token = await setup(s);
    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...studentPayload(s),
        permanentCommune: "Phường Bến Nghé",
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  } finally {
    await cleanup(s);
  }
});

test("school-info rejects an unknown province and commune", async () => {
  const s = scenario();
  try {
    const token = await setup(s);
    const response = await app.request("/api/v1/school/settings/school-info", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Address School",
        province: "Tỉnh Không Tồn Tại",
        commune: "Xã Không Tồn Tại",
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  } finally {
    await cleanup(s);
  }
});
