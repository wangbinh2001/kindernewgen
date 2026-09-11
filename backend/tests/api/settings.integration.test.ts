import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  schoolMemberships,
  schoolSettings,
  schools,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-settings-a-${id}`,
    schoolB: `test-settings-b-${id}`,
    phoneA: `0951${digits}`,
    phoneB: `0962${digits}`,
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
  for (const [phone, schoolId] of [
    [s.phoneA, s.schoolA],
    [s.phoneB, s.schoolB],
  ] as const) {
    await registerParent({ phone, schoolId, displayName: "School Admin" });
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, phone));
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(
        and(
          eq(schoolMemberships.userId, user!.id),
          eq(schoolMemberships.schoolId, schoolId),
        ),
      );
  }
  return { tokenA: await login(s.phoneA), tokenB: await login(s.phoneB) };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, (tx) =>
      tx.delete(schoolSettings).where(eq(schoolSettings.schoolId, schoolId)),
    );
  }
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.phoneA, s.phoneB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("school settings upsert and aggregate read", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const headers = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };
    const first = await app.request("/api/v1/school/settings/school-info", {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "Little Stars", phone: "0900000000" }),
    });
    expect(first.status).toBe(200);
    const second = await app.request("/api/v1/school/settings/school-info", {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "Little Stars Updated" }),
    });
    expect(second.status).toBe(200);
    const response = await app.request("/api/v1/school/settings", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body.data["school-info"]).toEqual({ name: "Little Stars Updated" });
  } finally {
    await cleanup(s);
  }
});

test("school settings are isolated across tenants", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const response = await app.request("/api/v1/school/settings/school-info", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Only A" }),
    });
    expect(response.status).toBe(200);
    const other = await app.request("/api/v1/school/settings", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(other.status).toBe(200);
    const body = (await other.json()) as { data: Record<string, unknown> };
    expect(body.data["school-info"]).toBeUndefined();
  } finally {
    await cleanup(s);
  }
});
