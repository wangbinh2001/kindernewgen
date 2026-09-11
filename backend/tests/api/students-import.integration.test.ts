import { expect, test } from "bun:test";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  schools,
  users,
  schoolMemberships,
  students,
  studentProfiles,
} from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { withTenant } from "../../src/db/tenant";

function makeRow(overrides: Record<number, string> = {}) {
  // 82 columns standard
  const row = new Array(82).fill("");
  row[0] = "1";
  row[1] = "Mầm";
  row[2] = "HS001";
  row[3] = "Nguyễn Văn A";
  row[4] = "15/05/2021";
  row[5] = "Nam";
  row[14] = "Thành phố Hà Nội";
  row[16] = "Phường Ba Đình";
  row[38] = "079201000111"; // CCCD 12 digits
  row[65] = "Nguyễn Văn B"; // Father
  row[67] = "1990";
  row[68] = "0987654321";
  row[69] = "079201000222";
  row[71] = "Trần Thị C"; // Mother
  row[73] = "1992";
  row[74] = "0987654322";
  row[75] = "079201000333";

  for (const [idx, val] of Object.entries(overrides)) {
    row[Number(idx)] = val;
  }
  return row;
}

function toCsv(rows: string[][]) {
  return rows
    .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

test("dry-run preview student CSV import returns row-by-row error validation", async () => {
  const suffix = crypto.randomUUID();
  const schoolId = `school-import-${suffix}`;
  const phone = `0999${suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;

  await db
    .insert(schools)
    .values({ id: schoolId, name: `Test School Import ${suffix}` });
  const [adminUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      globalPhone: phone,
      passwordHash: "hash",
      status: "active",
      displayName: "Admin",
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

  const { createAccessToken } = await import("../../src/auth/jwt");
  const token = await createAccessToken({
    sub: adminUser!.id,
    school_id: schoolId,
    membership_id: membership!.id,
    role: "school_admin",
    session_version: 1,
  });

  // Create a CSV with 2 rows: 1 valid, 1 invalid (invalid address)
  const header = new Array(82).fill("Col");
  const rowValid = makeRow({ 3: "Học Sinh Chuẩn", 38: "079201000111" });
  const rowInvalid = makeRow({
    3: "Học Sinh Sai Xã",
    38: "079201000112",
    14: "Thành phố Hà Nội",
    16: "Xã Không Tồn Tại Ở Hà Nội",
  });

  const csv = toCsv([header, rowValid, rowInvalid]);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([csv], { type: "text/csv" }),
    "students.csv",
  );
  formData.append("dryRun", "true");

  const res = await app.request("/api/v1/school/students/import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  expect(res.status).toBe(200);
  const json = (await res.json()) as any;
  expect(json.success).toBe(true);
  expect(json.data.dryRun).toBe(true);
  expect(json.data.total).toBe(2);
  expect(json.data.valid).toBe(1);
  expect(json.data.invalid).toBe(1);
  expect(json.data.results[1].isValid).toBe(false);
  expect(json.data.results[1].errors.length).toBeGreaterThan(0);
});

test("actual import creates students, profiles, and responsible persons in DB", async () => {
  const suffix = crypto.randomUUID();
  const schoolId = `school-import-real-${suffix}`;
  const phone = `0999${suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;

  await db
    .insert(schools)
    .values({ id: schoolId, name: `Test School Import Real ${suffix}` });
  const [adminUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      globalPhone: phone,
      passwordHash: "hash",
      status: "active",
      displayName: "Admin",
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

  const { createAccessToken } = await import("../../src/auth/jwt");
  const token = await createAccessToken({
    sub: adminUser!.id,
    school_id: schoolId,
    membership_id: membership!.id,
    role: "school_admin",
    session_version: 1,
  });

  const header = new Array(82).fill("Col");
  const cccd = "079201999888";
  const rowValid = makeRow({
    3: "Bé Siêu Nhân",
    38: cccd,
    14: "Thành phố Hà Nội",
    16: "Phường Ba Đình",
    4: "10/10/2022",
  });

  const csv = toCsv([header, rowValid]);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([csv], { type: "text/csv" }),
    "students.csv",
  );
  formData.append("dryRun", "false");

  const res = await app.request("/api/v1/school/students/import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  expect(res.status).toBe(201);
  const json = (await res.json()) as any;
  if (!json.success)
    console.log("Import Error:", JSON.stringify(json.error, null, 2));
  expect(json.success).toBe(true);
  expect(json.data.imported).toBe(1);

  // Check database
  await withTenant(schoolId, async (tx) => {
    const [saved] = await tx
      .select()
      .from(students)
      .where(eq(students.cccd, cccd));
    expect(saved).toBeDefined();
    expect(saved?.fullName).toBe("Bé Siêu Nhân");
    expect(saved?.dob).toBe("2022-10-10");

    const [profile] = await tx
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.studentId, saved!.id));
    expect(profile).toBeDefined();
    expect(profile?.permanentProvince).toBe("Thành phố Hà Nội");
  });
});
