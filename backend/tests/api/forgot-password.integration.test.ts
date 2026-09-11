import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/server";
import { db } from "../../src/db";
import { systemAdmins } from "../../src/db/schema";

async function createAdmin() {
  const [admin] = await db
    .insert(systemAdmins)
    .values({
      id: crypto.randomUUID(),
      username: `forgot-${crypto.randomUUID()}`,
      passwordHash: await Bun.password.hash("Admin#123", {
        algorithm: "argon2id",
      }),
      displayName: "Support Admin",
    })
    .returning();
  return admin!;
}

test("system admin can configure the forgot-password support phone", async () => {
  const admin = await createAdmin();
  try {
    const login = await app.request("/api/v1/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: admin.username, password: "Admin#123" }),
    });
    const token = ((await login.json()) as { data: { token: string } }).data
      .token;

    const response = await app.request(`/api/v1/system/admins/${admin.id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ phone: "0901234567" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { phone: string } };
    expect(body.data.phone).toBe("0901234567");
  } finally {
    await db.delete(systemAdmins).where(eq(systemAdmins.id, admin.id));
  }
});

test("forgot-password returns the configured support phone without account enumeration", async () => {
  const admin = await createAdmin();
  try {
    await db
      .update(systemAdmins)
      .set({ phone: "0901234567" })
      .where(eq(systemAdmins.id, admin.id));

    const existing = await app.request("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0907654321" }),
    });
    const unknown = await app.request("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0907654322" }),
    });

    expect(existing.status).toBe(200);
    expect(unknown.status).toBe(200);
    const existingBody = (await existing.json()) as {
      data: { supportPhone: string | null; message: string };
    };
    const unknownBody = (await unknown.json()) as {
      data: { supportPhone: string | null; message: string };
    };
    expect(existingBody.data.supportPhone).toBe("0901234567");
    expect(unknownBody.data).toEqual(existingBody.data);
  } finally {
    await db.delete(systemAdmins).where(eq(systemAdmins.id, admin.id));
  }
});
