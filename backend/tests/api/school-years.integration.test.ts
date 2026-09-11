import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  classes,
  schoolMemberships,
  schoolYears,
  schools,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

type Scenario = {
  schoolA: string;
  schoolB: string;
  phoneA: string;
  phoneB: string;
};

function scenario(): Scenario {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-years-a-${id}`,
    schoolB: `test-years-b-${id}`,
    phoneA: `0911${digits}`,
    phoneB: `0922${digits}`,
  };
}

async function login(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { token: string } };
  return body.data.token;
}

async function setup(s: Scenario) {
  await db.insert(schools).values([
    { id: s.schoolA, name: `Years A ${s.schoolA}` },
    { id: s.schoolB, name: `Years B ${s.schoolB}` },
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

async function cleanup(s: Scenario) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      await tx.delete(classes).where(eq(classes.schoolId, schoolId));
      await tx.delete(schoolYears).where(eq(schoolYears.schoolId, schoolId));
    });
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

const year = {
  name: "2026-2027",
  startDate: "2026-09-01",
  endDate: "2027-06-30",
};

test("school admin can create and list school years", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const created = await app.request("/api/v1/school/school-years", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(year),
    });
    expect(created.status).toBe(201);
    const listed = await app.request("/api/v1/school/school-years", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { data: unknown };
    expect(body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: year.name })]),
    );
  } finally {
    await cleanup(s);
  }
});

test("school year rejects duplicate name in the same school", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    for (let i = 0; i < 2; i++) {
      const response = await app.request("/api/v1/school/school-years", {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(year),
      });
      if (i === 0) expect(response.status).toBe(201);
      else expect(response.status).toBe(400);
    }
  } finally {
    await cleanup(s);
  }
});

test("school year cannot be deleted while it has a class", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const created = await app.request("/api/v1/school/school-years", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(year),
    });
    const yearId = ((await created.json()) as { data: { id: string } }).data.id;
    const classResponse = await app.request("/api/v1/school/classes", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Sunflower", schoolYearId: yearId }),
    });
    expect(classResponse.status).toBe(201);
    const deleted = await app.request(`/api/v1/school/school-years/${yearId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(deleted.status).toBe(400);
  } finally {
    await cleanup(s);
  }
});

test("activating a school year archives the other active year", async () => {
  const s = scenario();
  try {
    const { tokenA } = await setup(s);
    const create = async (name: string) => {
      const response = await app.request("/api/v1/school/school-years", {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenA}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...year, name }),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { data: { id: string } }).data.id;
    };
    const first = await create("First");
    const second = await create("Second");
    expect(
      (
        await app.request(`/api/v1/school/school-years/${first}/activate`, {
          method: "POST",
          headers: { authorization: `Bearer ${tokenA}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/v1/school/school-years/${second}/activate`, {
          method: "POST",
          headers: { authorization: `Bearer ${tokenA}` },
        })
      ).status,
    ).toBe(200);
    const firstBody = (await (
      await app.request(`/api/v1/school/school-years/${first}`, {
        headers: { authorization: `Bearer ${tokenA}` },
      })
    ).json()) as { data: { status: string } };
    const secondBody = (await (
      await app.request(`/api/v1/school/school-years/${second}`, {
        headers: { authorization: `Bearer ${tokenA}` },
      })
    ).json()) as { data: { status: string } };
    expect(firstBody.data.status).toBe("archived");
    expect(secondBody.data.status).toBe("active");
  } finally {
    await cleanup(s);
  }
});

test("school year data is isolated across tenants", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const created = await app.request("/api/v1/school/school-years", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(year),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    const response = await app.request(`/api/v1/school/school-years/${id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(response.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
