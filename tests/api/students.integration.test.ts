import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  parentChildren,
  responsiblePersons,
  schoolMemberships,
  schools,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

type Scenario = {
  schoolA: string;
  schoolB: string;
  phoneA: string;
  phoneB: string;
  parentPhone: string;
};

type AuthResponse = {
  data: { token?: string };
};

type StudentRecord = {
  id: string;
  schoolId: string;
  fullName: string;
  status: string;
  createdAt?: string;
};

type StudentsResponse = {
  success: boolean;
  data: {
    items: StudentRecord[];
    total: number;
    page: number;
    limit: number;
  };
  error: { code: string; message: string } | null;
};

function createScenario(): Scenario {
  const suffix = crypto.randomUUID();
  const phoneDigits = suffix.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");

  return {
    schoolA: `test-school-students-a-${suffix}`,
    schoolB: `test-school-students-b-${suffix}`,
    phoneA: `0911${phoneDigits}`,
    phoneB: `0922${phoneDigits}`,
    parentPhone: `0908${phoneDigits}`,
  };
}

async function setupScenario(scenario: Scenario) {
  await db.insert(schools).values([
    { id: scenario.schoolA, name: `Test Students A ${scenario.schoolA}` },
    { id: scenario.schoolB, name: `Test Students B ${scenario.schoolB}` },
  ]);

  await registerParent({
    phone: scenario.phoneA,
    schoolId: scenario.schoolA,
    displayName: "Student Integration User A",
  });
  await registerParent({
    phone: scenario.phoneB,
    schoolId: scenario.schoolB,
    displayName: "Student Integration User B",
  });

  for (const phone of [scenario.phoneA, scenario.phoneB]) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, phone));
    if (!user) {
      throw new Error("Student integration user was not created");
    }
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(eq(schoolMemberships.userId, user.id));
  }

  const tokenA = await login(scenario.phoneA);
  const tokenB = await login(scenario.phoneB);
  return { tokenA, tokenB };
}

async function login(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as AuthResponse;
  expect(typeof body.data.token).toBe("string");
  return body.data.token!;
}

function createStudentPayload(
  scenario: Scenario,
  fullName: string,
  cccd = crypto.randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12),
) {
  return {
    full_name: fullName,
    dob: "2020-01-02",
    gender: "female",
    cccd,
    cccd_issue_date: "2020-02-03",
    cccd_issue_place: "Ho Chi Minh City",
    address: "1 Test Street",
    responsiblePersons: [
      {
        type: "mother",
        fullName: "Existing Parent",
        yearOfBirth: 1990,
        cccd: "079000000001",
        phone: scenario.parentPhone,
      },
    ],
  };
}

async function createStudent(
  scenario: Scenario,
  token: string,
  fullName: string,
  cccd?: string,
) {
  const response = await app.request("/api/v1/students", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(createStudentPayload(scenario, fullName, cccd)),
  });

  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: StudentRecord };
  return body.data.id;
}

async function cleanupScenario(scenario: Scenario) {
  for (const schoolId of [scenario.schoolA, scenario.schoolB]) {
    const tenantStudents = await withTenant(schoolId, async (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.schoolId, schoolId)),
    );
    const studentIds = tenantStudents.map((student) => student.id);
    if (studentIds.length > 0) {
      await db
        .delete(parentChildren)
        .where(inArray(parentChildren.childId, studentIds));
      await withTenant(schoolId, async (tx) => {
        await tx
          .delete(responsiblePersons)
          .where(inArray(responsiblePersons.studentId, studentIds));
      });
    }
    await withTenant(schoolId, async (tx) => {
      await tx.delete(students).where(eq(students.schoolId, schoolId));
    });
  }

  const foundUsers = await db
    .select()
    .from(users)
    .where(
      inArray(users.globalPhone, [
        scenario.phoneA,
        scenario.phoneB,
        scenario.parentPhone,
      ]),
    );
  for (const user of foundUsers) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }

  await db
    .delete(schools)
    .where(inArray(schools.id, [scenario.schoolA, scenario.schoolB]));
}

test("User A can create and read a student in User A's tenant", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const createResponse = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(createStudentPayload(scenario, "Student A")),
    });

    expect(createResponse.status).toBe(201);

    const listResponse = await app.request("/api/v1/students", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listResponse.status).toBe(200);
    const body = (await listResponse.json()) as StudentsResponse;
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      schoolId: scenario.schoolA,
      fullName: "Student A",
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("POST ignores a foreign school_id and writes through the token tenant", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...createStudentPayload(scenario, "Attempted School B Student"),
        school_id: scenario.schoolB,
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: { schoolId: string };
    };
    expect(body.data.schoolId).toBe(scenario.schoolA);

    const studentsInA = await withTenant(scenario.schoolA, async (tx) =>
      tx.select().from(students).where(eq(students.schoolId, scenario.schoolA)),
    );
    const studentsInB = await withTenant(scenario.schoolB, async (tx) =>
      tx.select().from(students).where(eq(students.schoolId, scenario.schoolB)),
    );
    expect(studentsInA).toHaveLength(1);
    expect(studentsInB).toHaveLength(0);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("User B cannot see a student created in User A's tenant", async () => {
  const scenario = createScenario();

  try {
    const { tokenA, tokenB } = await setupScenario(scenario);
    const createResponse = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        createStudentPayload(scenario, "Only School A Student"),
      ),
    });
    expect(createResponse.status).toBe(201);

    const listResponse = await app.request("/api/v1/students", {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(listResponse.status).toBe(200);
    const body = (await listResponse.json()) as StudentsResponse;
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("POST returns a validation error for malformed JSON", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("revoked tenant membership blocks the old token", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const [userA] = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, scenario.phoneA));
    if (!userA) {
      throw new Error("Test user A was not created");
    }

    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, userA.id));
    await db.delete(schools).where(eq(schools.id, scenario.schoolA));

    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        createStudentPayload(scenario, "School Deleted Student"),
      ),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "Session expired or revoked" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("GET students returns paginated and case-insensitive search results", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    await createStudent(scenario, tokenA, "Alpha Child");
    await createStudent(scenario, tokenA, "Alpha Learner");
    await createStudent(scenario, tokenA, "Beta Child");

    const defaultResponse = await app.request("/api/v1/students", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(defaultResponse.status).toBe(200);
    const defaultBody = (await defaultResponse.json()) as StudentsResponse;
    expect(defaultBody.data).toMatchObject({
      total: 3,
      page: 1,
      limit: 20,
    });
    expect(defaultBody.data.items).toHaveLength(3);

    const searchResponse = await app.request(
      "/api/v1/students?page=2&limit=1&search=ALPHA",
      { headers: { authorization: `Bearer ${tokenA}` } },
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = (await searchResponse.json()) as StudentsResponse;
    expect(searchBody.data).toMatchObject({
      total: 2,
      page: 2,
      limit: 1,
    });
    expect(searchBody.data.items).toHaveLength(1);
    expect(searchBody.data.items[0]?.fullName.toLowerCase()).toContain("alpha");
  } finally {
    await cleanupScenario(scenario);
  }
});

test("GET student by id returns the tenant-owned student", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const studentId = await createStudent(scenario, tokenA, "Student Detail");
    const response = await app.request(`/api/v1/students/${studentId}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: StudentRecord & { responsiblePersons: unknown[] };
      error: null;
    };
    expect(body).toMatchObject({
      success: true,
      data: {
        id: studentId,
        fullName: "Student Detail",
        responsiblePersons: expect.any(Array),
      },
      error: null,
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("GET student by id returns NOT_FOUND for an unknown id", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const response = await app.request(
      `/api/v1/students/${crypto.randomUUID()}`,
      { headers: { authorization: `Bearer ${tokenA}` } },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_FOUND" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("GET student by id cannot cross tenant boundaries", async () => {
  const scenario = createScenario();

  try {
    const { tokenA, tokenB } = await setupScenario(scenario);
    const studentId = await createStudent(scenario, tokenA, "Private Student");
    const response = await app.request(`/api/v1/students/${studentId}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_FOUND" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("PUT student updates allowed fields within the tenant", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const studentId = await createStudent(scenario, tokenA, "Old Student Name");
    const response = await app.request(`/api/v1/students/${studentId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: "New Student Name",
        status: "inactive",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: StudentRecord };
    expect(body.data).toMatchObject({
      id: studentId,
      schoolId: scenario.schoolA,
      fullName: "New Student Name",
      status: "inactive",
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("PUT student updates profile fields but keeps an existing cccd immutable", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const studentId = await createStudent(scenario, tokenA, "Profile Before");
    const response = await app.request(`/api/v1/students/${studentId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Profile After",
        dob: "2019-03-04",
        gender: "male",
        cccdIssueDate: "2019-04-05",
        cccdIssuePlace: "Da Nang",
        address: "2 Updated Street",
        responsiblePersons: [
          {
            type: "father",
            fullName: "Updated Parent",
            yearOfBirth: 1988,
            cccd: "079000000002",
            phone: scenario.parentPhone,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: StudentRecord & { responsiblePersons: unknown[] };
    };
    expect(body.data).toMatchObject({
      id: studentId,
      fullName: "Profile After",
      dob: "2019-03-04",
      gender: "male",
      cccdIssueDate: "2019-04-05",
      cccdIssuePlace: "Da Nang",
      address: "2 Updated Street",
      responsiblePersons: [
        expect.objectContaining({ fullName: "Updated Parent" }),
      ],
    });

    const lockedResponse = await app.request(`/api/v1/students/${studentId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ cccd: "079999999999" }),
    });
    expect(lockedResponse.status).toBe(400);
    expect(await lockedResponse.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("PUT student rejects id and schoolId updates", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const studentId = await createStudent(scenario, tokenA, "Strict Student");
    const response = await app.request(`/api/v1/students/${studentId}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        schoolId: scenario.schoolB,
        fullName: "Should Be Rejected",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("DELETE student soft-deletes without removing the database row", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const studentId = await createStudent(scenario, tokenA, "Deleted Student");
    const response = await app.request(`/api/v1/students/${studentId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: StudentRecord };
    expect(body.data).toMatchObject({ id: studentId, status: "deleted" });

    const [storedStudent] = await withTenant(scenario.schoolA, async (tx) =>
      tx.select().from(students).where(eq(students.id, studentId)),
    );
    expect(storedStudent).toMatchObject({ id: studentId, status: "deleted" });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("DELETE student returns NOT_FOUND for an unknown id", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const response = await app.request(
      `/api/v1/students/${crypto.randomUUID()}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokenA}` },
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_FOUND" },
    });
  } finally {
    await cleanupScenario(scenario);
  }
});

test("POST creates a detailed student profile and links its parent", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const payload = createStudentPayload(scenario, "Profile Student");
    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      data: StudentRecord & { responsiblePersons: unknown[] };
    };
    expect(body.data).toMatchObject({
      fullName: "Profile Student",
      dob: payload.dob,
      gender: payload.gender,
      cccd: payload.cccd,
      cccdIssueDate: payload.cccd_issue_date,
      cccdIssuePlace: payload.cccd_issue_place,
      address: payload.address,
      responsiblePersons: expect.arrayContaining([
        expect.objectContaining({ phone: scenario.parentPhone }),
      ]),
    });

    const [parent] = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, scenario.parentPhone));
    expect(parent).toBeDefined();

    const links = await db
      .select()
      .from(parentChildren)
      .where(eq(parentChildren.childId, body.data.id));
    expect(links).toHaveLength(1);
    expect(links[0]?.parentId).toBe(parent?.id);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("POST rejects a duplicate cccd within the same school", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const duplicateCccd = "079123456789";
    const firstResponse = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        createStudentPayload(scenario, "First CCCD Student", duplicateCccd),
      ),
    });
    expect(firstResponse.status).toBe(201);

    const secondResponse = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        createStudentPayload(scenario, "Duplicate CCCD Student", duplicateCccd),
      ),
    });
    expect(secondResponse.status).toBe(400);
    expect(await secondResponse.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });

    const matchingStudents = await withTenant(scenario.schoolA, async (tx) =>
      tx.select().from(students).where(eq(students.cccd, duplicateCccd)),
    );
    expect(matchingStudents).toHaveLength(1);
  } finally {
    await cleanupScenario(scenario);
  }
});

test("POST reuses an existing parent and only creates a child link", async () => {
  const scenario = createScenario();

  try {
    const { tokenA } = await setupScenario(scenario);
    const existingParent = await registerParent({
      phone: scenario.parentPhone,
      schoolId: scenario.schoolA,
      displayName: "Preexisting Parent",
    });
    const usersBefore = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, scenario.parentPhone));

    const response = await app.request("/api/v1/students", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(createStudentPayload(scenario, "Linked Student")),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: StudentRecord };

    const usersAfter = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, scenario.parentPhone));
    expect(existingParent.created).toBe(true);
    expect(usersAfter).toHaveLength(usersBefore.length);
    expect(usersAfter[0]?.id).toBe(existingParent.user.id);

    const links = await db
      .select()
      .from(parentChildren)
      .where(eq(parentChildren.childId, body.data.id));
    expect(links).toHaveLength(1);
    expect(links[0]?.parentId).toBe(existingParent.user.id);
  } finally {
    await cleanupScenario(scenario);
  }
});
