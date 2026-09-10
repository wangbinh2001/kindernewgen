import { decodeJwt } from "jose";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  schoolMemberships,
  schools,
  systemAdmins,
  users,
} from "../../src/db/schema";

async function createAdmin(status: "active" | "locked" = "active") {
  const username = `sys-${crypto.randomUUID()}`;
  const [admin] = await db
    .insert(systemAdmins)
    .values({
      id: crypto.randomUUID(),
      username,
      passwordHash: await Bun.password.hash("Admin#123", {
        algorithm: "argon2id",
      }),
      displayName: "System Operator",
      status,
    })
    .returning();
  return admin!;
}

async function loginAdmin(username: string, password = "Admin#123") {
  return app.request("/api/v1/auth/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

async function cleanupAdmin(id: string) {
  await db.delete(systemAdmins).where(eq(systemAdmins.id, id));
}

test("system admin login returns a non-tenant JWT and rejects bad credentials", async () => {
  const admin = await createAdmin();
  try {
    const valid = await loginAdmin(admin.username);
    expect(valid.status).toBe(200);
    const validBody = (await valid.json()) as { data: { token: string } };
    const claims = decodeJwt(validBody.data.token);
    expect(claims.sub).toBe(admin.id);
    expect(claims.role).toBe("system_admin");
    expect(claims.session_version).toBe(1);
    expect("school_id" in claims).toBe(false);
    expect("membership_id" in claims).toBe(false);

    const invalid = await loginAdmin(admin.username, "wrong-password");
    expect(invalid.status).toBe(401);
  } finally {
    await cleanupAdmin(admin.id);
  }
});

test("locked system admin cannot login", async () => {
  const admin = await createAdmin("locked");
  try {
    const response = await loginAdmin(admin.username);
    expect(response.status).toBe(401);
  } finally {
    await cleanupAdmin(admin.id);
  }
});

test("system and tenant tokens are blocked from the opposite namespace", async () => {
  const admin = await createAdmin();
  const schoolId = `test-system-rbac-${crypto.randomUUID()}`;
  const phone = `0971${crypto.randomUUID().replace(/\D/g, "").slice(0, 6)}`;
  try {
    const adminLogin = await loginAdmin(admin.username);
    const adminToken = (
      (await adminLogin.json()) as { data: { token: string } }
    ).data.token;
    const tenantResponse = await app.request("/api/v1/school/students", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(tenantResponse.status).toBe(403);

    await db.insert(schools).values({ id: schoolId, name: `RBAC ${schoolId}` });
    await registerParent({
      phone,
      schoolId,
      displayName: "School Admin",
    });
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, phone));
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(eq(schoolMemberships.userId, user!.id));
    const tenantLogin = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, password: "123456" }),
    });
    const tenantToken = (
      (await tenantLogin.json()) as { data: { token: string } }
    ).data.token;
    const systemResponse = await app.request("/api/v1/system/schools", {
      headers: { authorization: `Bearer ${tenantToken}` },
    });
    expect(systemResponse.status).toBe(403);
  } finally {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.globalPhone, phone));
    if (user) {
      await db
        .delete(schoolMemberships)
        .where(eq(schoolMemberships.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
    await db.delete(schools).where(eq(schools.id, schoolId));
    await cleanupAdmin(admin.id);
  }
});

test("system admin can CRUD schools", async () => {
  const admin = await createAdmin();
  let schoolId = "";
  try {
    const loginResponse = await loginAdmin(admin.username);
    const token = ((await loginResponse.json()) as { data: { token: string } })
      .data.token;
    const create = await app.request("/api/v1/system/schools", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: `System School ${crypto.randomUUID()}`,
        phone: "0281234567",
        email: "school@example.com",
        address: "District 1",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      data: { id: string; createdBy: string };
    };
    schoolId = created.data.id;
    expect(created.data.createdBy).toBe(admin.id);

    const listed = await app.request("/api/v1/system/schools", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { data: unknown };
    expect(listBody.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: schoolId })]),
    );

    const detail = await app.request(`/api/v1/system/schools/${schoolId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.status).toBe(200);

    const update = await app.request(`/api/v1/system/schools/${schoolId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ address: "District 3" }),
    });
    expect(update.status).toBe(200);

    const suspend = await app.request(
      `/api/v1/system/schools/${schoolId}/status`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "suspended" }),
      },
    );
    expect(suspend.status).toBe(200);
    const suspendBody = (await suspend.json()) as { data: { status: string } };
    expect(suspendBody.data.status).toBe("suspended");
  } finally {
    if (schoolId) await db.delete(schools).where(eq(schools.id, schoolId));
    await cleanupAdmin(admin.id);
  }
});
