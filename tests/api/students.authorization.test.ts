import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { db } from "../../src/db";
import { schoolMemberships, schools, users } from "../../src/db/schema";
import { app } from "../../src/server";

type Scenario = {
  schoolId: string;
  phone: string;
};

function createScenario(): Scenario {
  const suffix = crypto.randomUUID();
  const digits = suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolId: `test-school-rbac-${suffix}`,
    phone: `0933${digits}`,
  };
}

async function setRole(
  scenario: Scenario,
  role: "school_admin" | "staff" | "teacher",
) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, scenario.phone));
  if (!user) {
    throw new Error("RBAC test user was not created");
  }

  await db
    .update(schoolMemberships)
    .set({ role })
    .where(
      and(
        eq(schoolMemberships.userId, user.id),
        eq(schoolMemberships.schoolId, scenario.schoolId),
      ),
    );
}

async function login(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { token?: string } };
  expect(typeof body.data.token).toBe("string");
  return body.data.token!;
}

async function setupScenario(scenario: Scenario) {
  await db.insert(schools).values({
    id: scenario.schoolId,
    name: `Test RBAC School ${scenario.schoolId}`,
  });
  await registerParent({
    phone: scenario.phone,
    schoolId: scenario.schoolId,
    displayName: "RBAC Test User",
  });
}

async function cleanupScenario(scenario: Scenario) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, scenario.phone));
  if (user) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(eq(schools.id, scenario.schoolId));
}

test("parent cannot access school student endpoints", async () => {
  const scenario = createScenario();

  try {
    await setupScenario(scenario);
    const token = await login(scenario.phone);

    const listResponse = await app.request("/api/v1/school/students", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.status).toBe(403);
    expect(await listResponse.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });

    const createResponse = await app.request("/api/v1/school/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ full_name: "Should Be Rejected" }),
    });
    expect(createResponse.status).toBe(403);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("staff can read students but cannot mutate them", async () => {
  const scenario = createScenario();

  try {
    await setupScenario(scenario);
    await setRole(scenario, "staff");
    const token = await login(scenario.phone);

    const listResponse = await app.request("/api/v1/school/students", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.status).toBe(200);

    const createResponse = await app.request("/api/v1/school/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ full_name: "Should Be Rejected" }),
    });
    expect(createResponse.status).toBe(403);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("teacher access is denied until class-scoped authorization exists", async () => {
  const scenario = createScenario();

  try {
    await setupScenario(scenario);
    await setRole(scenario, "teacher");
    const token = await login(scenario.phone);

    const response = await app.request("/api/v1/school/students", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("school admin can use the canonical school student endpoint", async () => {
  const scenario = createScenario();

  try {
    await setupScenario(scenario);
    await setRole(scenario, "school_admin");
    const token = await login(scenario.phone);

    const response = await app.request("/api/v1/school/students", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { items: [], total: 0, page: 1, limit: 20 },
      error: null,
    });
  } finally {
    await cleanupScenario(scenario);
  }
});
