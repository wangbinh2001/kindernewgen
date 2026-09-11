import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { schools, users, schoolMemberships } from "../../src/db/schema";
import { registerParent } from "../../src/auth/register";

const SCHOOL_ID = "test-school-register";

async function cleanup(phone: string) {
  const found = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, phone));
  for (const u of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
}

async function ensureSchool() {
  await db
    .insert(schools)
    .values({ id: SCHOOL_ID, name: "Test School Register" })
    .onConflictDoNothing();
}

test("registerParent creates user with default password and parent membership", async () => {
  const phone = "0911000203";
  await cleanup(phone);
  await ensureSchool();

  const result = await registerParent({
    phone,
    schoolId: SCHOOL_ID,
    displayName: "Phụ huynh Test",
  });

  // user được tạo với phone, default password, must_change_password = true
  expect(result.created).toBe(true);
  expect(result.user.globalPhone).toBe(phone);
  expect(result.user.mustChangePassword).toBe(true);

  // password mặc định hash bằng Argon2id, verify được
  expect(await Bun.password.verify("123456", result.user.passwordHash)).toBe(
    true,
  );

  // membership role parent gắn với school
  const memberships = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, result.user.id));
  expect(memberships.length).toBe(1);
  const membership = memberships[0];
  expect(membership?.schoolId).toBe(SCHOOL_ID);
  expect(membership?.role).toBe("parent");
  expect(membership?.status).toBe("active");

  await cleanup(phone);
});

test("registerParent is idempotent on existing phone — returns existing user", async () => {
  const phone = "0911000204";
  await cleanup(phone);
  await ensureSchool();

  const first = await registerParent({
    phone,
    schoolId: SCHOOL_ID,
    displayName: "Phụ huynh A",
  });
  const second = await registerParent({
    phone,
    schoolId: SCHOOL_ID,
    displayName: "Phụ huynh B",
  });

  // không tạo user mới, không ghi đè display name
  expect(second.created).toBe(false);
  expect(second.user.id).toBe(first.user.id);

  // membership vẫn 1 bản ghi (unique user+school+role)
  const memberships = await db
    .select()
    .from(schoolMemberships)
    .where(eq(schoolMemberships.userId, first.user.id));
  expect(memberships.length).toBe(1);

  await cleanup(phone);
});

test("registerParent rejects invalid phone", async () => {
  await cleanup("not-a-phone");
  expect(
    registerParent({
      phone: "not-a-phone",
      schoolId: SCHOOL_ID,
      displayName: "X",
    }),
  ).rejects.toThrow();
});
