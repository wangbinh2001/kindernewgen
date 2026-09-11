import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  schoolMemberships,
  schools,
  storageObjects,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";
import { createAccessToken } from "../../src/auth/jwt";
import {
  getStorageProvider,
  LocalStorageProvider,
  S3StorageProvider,
  createStorageToken,
  verifyStorageToken,
  storagePath,
} from "../../src/storage/provider";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-storage-a-${id}`,
    schoolB: `test-storage-b-${id}`,
    phoneA: `0941${digits}`,
    phoneB: `0952${digits}`,
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
  await registerParent({
    phone: s.phoneA,
    schoolId: s.schoolA,
    displayName: "Admin A",
  });
  await registerParent({
    phone: s.phoneB,
    schoolId: s.schoolB,
    displayName: "Admin B",
  });
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.phoneA, s.phoneB]));
  for (const user of found) {
    await db
      .update(schoolMemberships)
      .set({ role: "school_admin" })
      .where(eq(schoolMemberships.userId, user.id));
  }
  return { tokenA: await login(s.phoneA), tokenB: await login(s.phoneB) };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, (tx) =>
      tx.delete(storageObjects).where(eq(storageObjects.schoolId, schoolId)),
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

test("storage issues an upload URL and serves the uploaded object", async () => {
  const s = scenario();
  process.env.STORAGE_LOCAL_ROOT = `${process.env.TEMP ?? process.env.TMP ?? "."}/kinder-storage-tests`;
  try {
    const { tokenA } = await setup(s);
    const headers = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };
    const created = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers,
      body: JSON.stringify({
        fileName: "report.pdf",
        contentType: "application/pdf",
        size: 11,
        purpose: "parent_request",
      }),
    });
    expect(created.status).toBe(201);
    const object = (await created.json()) as {
      data: { id: string; uploadUrl: string };
    };
    const upload = await app.request(object.data.uploadUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/pdf",
      },
      body: "hello file!",
    });
    expect(upload.status).toBe(200);
    const downloaded = await app.request(
      `/api/v1/school/storage/objects/${object.data.id}/content`,
      { headers: { authorization: `Bearer ${tokenA}` } },
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toContain("application/pdf");
    expect(await downloaded.text()).toBe("hello file!");
  } finally {
    await cleanup(s);
  }
});

test("storage objects are isolated across tenants and validate file limits", async () => {
  const s = scenario();
  try {
    const { tokenA, tokenB } = await setup(s);
    const bad = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "script.exe",
        contentType: "application/octet-stream",
        size: 10,
        purpose: "timeline",
      }),
    });
    expect(bad.status).toBe(400);
    const created = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "photo.jpg",
        contentType: "image/jpeg",
        size: 4,
        purpose: "timeline",
      }),
    });
    const object = (await created.json()) as { data: { id: string } };
    const crossTenant = await app.request(
      `/api/v1/school/storage/objects/${object.data.id}/content`,
      {
        headers: { authorization: `Bearer ${tokenB}` },
      },
    );
    expect(crossTenant.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});

test("signed upload and download tokens enforce expiry and tenant isolation", async () => {
  const s = scenario();
  process.env.STORAGE_LOCAL_ROOT = `${process.env.TEMP ?? process.env.TMP ?? "."}/kinder-storage-tests`;
  try {
    const { tokenA, tokenB } = await setup(s);
    const headersA = {
      authorization: `Bearer ${tokenA}`,
      "content-type": "application/json",
    };

    // Request upload URL
    const uploadRes = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers: headersA,
      body: JSON.stringify({
        fileName: "signed-test.png",
        contentType: "image/png",
        size: 8,
        purpose: "student",
      }),
    });
    expect(uploadRes.status).toBe(201);
    const uploadJson = (await uploadRes.json()) as {
      data: { id: string; uploadUrl: string; downloadUrl?: string; expiresIn: number };
    };
    expect(uploadJson.data.uploadUrl).toContain("token=");
    expect(uploadJson.data.expiresIn).toBe(900);

    const uploadUrl = uploadJson.data.uploadUrl;
    const objectId = uploadJson.data.id;

    // Tenant B cannot use Tenant A's signed upload URL
    const crossUpload = await app.request(uploadUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${tokenB}`,
        "content-type": "image/png",
      },
      body: "12345678",
    });
    expect(crossUpload.status).toBe(403);

    // Upload with valid signed token without Bearer auth (presigned URL)
    const validUpload = await app.request(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: "12345678",
    });
    expect(validUpload.status).toBe(200);

    // Expired upload token returns 401 or 403
    const expiredUploadToken = await createStorageToken({
      objectId,
      schoolId: s.schoolA,
      ownerId: "some-user",
      action: "upload",
      expiresInSeconds: -10,
    });
    const expiredUpload = await app.request(
      `/api/v1/school/storage/objects/${objectId}/content?token=${expiredUploadToken}`,
      {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "12345678",
      },
    );
    expect([401, 403]).toContain(expiredUpload.status);

    // Metadata endpoint
    const metaA = await app.request(`/api/v1/school/storage/objects/${objectId}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(metaA.status).toBe(200);
    const metaJson = (await metaA.json()) as {
      data: { id: string; objectKey: string; originalName: string; contentType: string; size: number; status: string; downloadUrl: string };
    };
    expect(metaJson.data.id).toBe(objectId);
    expect(metaJson.data.status).toBe("uploaded");
    expect(metaJson.data.originalName).toBe("signed-test.png");
    expect(metaJson.data.downloadUrl).toContain("token=");

    // Cross-tenant cannot view metadata
    const metaB = await app.request(`/api/v1/school/storage/objects/${objectId}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(metaB.status).toBe(404);

    // Download via signed download URL without Bearer
    const downloadRes = await app.request(metaJson.data.downloadUrl);
    expect(downloadRes.status).toBe(200);
    expect(await downloadRes.text()).toBe("12345678");

    // Expired download token returns 401 or 403
    const expiredDownloadToken = await createStorageToken({
      objectId,
      schoolId: s.schoolA,
      ownerId: "some-user",
      action: "download",
      expiresInSeconds: -10,
    });
    const expiredDownload = await app.request(
      `/api/v1/school/storage/objects/${objectId}/content?token=${expiredDownloadToken}`,
    );
    expect([401, 403]).toContain(expiredDownload.status);

    // Tenant B cannot use Tenant A's signed download URL
    const crossDownloadToken = await createStorageToken({
      objectId,
      schoolId: s.schoolA,
      ownerId: "some-user",
      action: "download",
      expiresInSeconds: 900,
    });
    const crossDownload = await app.request(
      `/api/v1/school/storage/objects/${objectId}/content?token=${crossDownloadToken}`,
      {
        headers: { authorization: `Bearer ${tokenB}` },
      },
    );
    expect(crossDownload.status).toBe(403);
  } finally {
    await cleanup(s);
  }
});

test("storage object deletion: owner and school_admin permissions, soft-delete and 404 behavior", async () => {
  const s = scenario();
  process.env.STORAGE_LOCAL_ROOT = `${process.env.TEMP ?? process.env.TMP ?? "."}/kinder-storage-tests`;
  try {
    const { tokenA, tokenB } = await setup(s);

    // Create a regular teacher in school A (not admin, not owner)
    const teacherId = crypto.randomUUID();
    const teacherPhone = `0977${teacherId.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;
    await db.insert(users).values({
      id: teacherId,
      globalPhone: teacherPhone,
      passwordHash: "hash",
      status: "active",
      displayName: "Teacher Other",
    });
    const [teacherMember] = await db.insert(schoolMemberships).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      userId: teacherId,
      role: "teacher",
      status: "active",
    }).returning();
    const teacherToken = await createAccessToken({
      sub: teacherId,
      school_id: s.schoolA,
      membership_id: teacherMember!.id,
      role: "teacher",
      session_version: 1,
    });

    // Create object owned by teacher
    const createRes = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${teacherToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "teacher-note.pdf",
        contentType: "application/pdf",
        size: 9,
        purpose: "document",
      }),
    });
    expect(createRes.status).toBe(201);
    const createdObj = (await createRes.json()) as { data: { id: string; uploadUrl: string } };

    // Upload content
    await app.request(createdObj.data.uploadUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${teacherToken}`,
        "content-type": "application/pdf",
      },
      body: "teacher12",
    });

    // Another teacher (non-owner, non-admin) cannot delete
    const otherTeacherId = crypto.randomUUID();
    const otherPhone = `0988${otherTeacherId.replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`;
    await db.insert(users).values({
      id: otherTeacherId,
      globalPhone: otherPhone,
      passwordHash: "hash",
      status: "active",
      displayName: "Teacher Second",
    });
    const [otherMember] = await db.insert(schoolMemberships).values({
      id: crypto.randomUUID(),
      schoolId: s.schoolA,
      userId: otherTeacherId,
      role: "teacher",
      status: "active",
    }).returning();
    const otherTeacherToken = await createAccessToken({
      sub: otherTeacherId,
      school_id: s.schoolA,
      membership_id: otherMember!.id,
      role: "teacher",
      session_version: 1,
    });

    const forbiddenDel = await app.request(`/api/v1/school/storage/objects/${createdObj.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${otherTeacherToken}` },
    });
    expect(forbiddenDel.status).toBe(403);

    // Tenant B cannot delete Tenant A's object
    const crossTenantDel = await app.request(`/api/v1/school/storage/objects/${createdObj.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(crossTenantDel.status).toBe(404);

    // DELETE requires Bearer token (no anonymous delete)
    const anonDel = await app.request(`/api/v1/school/storage/objects/${createdObj.data.id}`, {
      method: "DELETE",
    });
    expect(anonDel.status).toBe(401);

    // Owner CAN delete their own object
    const ownerDel = await app.request(`/api/v1/school/storage/objects/${createdObj.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(ownerDel.status).toBe(200);

    // Deleted object returns 404 for GET content, GET metadata, and PUT content
    const getDeletedContent = await app.request(
      `/api/v1/school/storage/objects/${createdObj.data.id}/content`,
      { headers: { authorization: `Bearer ${tokenA}` } },
    );
    expect(getDeletedContent.status).toBe(404);

    const getDeletedMeta = await app.request(
      `/api/v1/school/storage/objects/${createdObj.data.id}`,
      { headers: { authorization: `Bearer ${tokenA}` } },
    );
    expect(getDeletedMeta.status).toBe(404);

    const putDeletedContent = await app.request(
      `/api/v1/school/storage/objects/${createdObj.data.id}/content`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${teacherToken}`,
          "content-type": "application/pdf",
        },
        body: "teacher12",
      },
    );
    expect(putDeletedContent.status).toBe(404);

    // Test school_admin can delete any object in their school
    const adminObjRes = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers: {
        authorization: `Bearer ${teacherToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "another-doc.pdf",
        contentType: "application/pdf",
        size: 9,
        purpose: "document",
      }),
    });
    const adminObj = (await adminObjRes.json()) as { data: { id: string; uploadUrl: string } };
    await app.request(adminObj.data.uploadUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${teacherToken}`,
        "content-type": "application/pdf",
      },
      body: "teacher99",
    });

    const adminDel = await app.request(`/api/v1/school/storage/objects/${adminObj.data.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenA}` }, // tokenA is school_admin of schoolA
    });
    expect(adminDel.status).toBe(200);

    // Clean up temporary teachers
    await db.delete(schoolMemberships).where(inArray(schoolMemberships.id, [teacherMember!.id, otherMember!.id]));
    await db.delete(users).where(inArray(users.id, [teacherId, otherTeacherId]));
  } finally {
    await cleanup(s);
  }
});

test("S3StorageProvider throws configuration error when required envs are missing", () => {
  const origProvider = process.env.STORAGE_PROVIDER;
  const origEndpoint = process.env.STORAGE_ENDPOINT;
  const origBucket = process.env.STORAGE_BUCKET;
  const origRegion = process.env.STORAGE_REGION;
  const origAccessKey = process.env.STORAGE_ACCESS_KEY_ID;
  const origSecretKey = process.env.STORAGE_SECRET_ACCESS_KEY;

  try {
    delete process.env.STORAGE_ENDPOINT;
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_REGION;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;

    expect(() => new S3StorageProvider()).toThrow(/missing.*(STORAGE_ENDPOINT|STORAGE_BUCKET|STORAGE_ACCESS_KEY_ID|STORAGE_SECRET_ACCESS_KEY|STORAGE_REGION)/i);

    process.env.STORAGE_PROVIDER = "s3";
    expect(() => getStorageProvider()).toThrow();

    process.env.STORAGE_PROVIDER = "local";
    const local = getStorageProvider();
    expect(local).toBeInstanceOf(LocalStorageProvider);
  } finally {
    if (origProvider) process.env.STORAGE_PROVIDER = origProvider; else delete process.env.STORAGE_PROVIDER;
    if (origEndpoint) process.env.STORAGE_ENDPOINT = origEndpoint; else delete process.env.STORAGE_ENDPOINT;
    if (origBucket) process.env.STORAGE_BUCKET = origBucket; else delete process.env.STORAGE_BUCKET;
    if (origRegion) process.env.STORAGE_REGION = origRegion; else delete process.env.STORAGE_REGION;
    if (origAccessKey) process.env.STORAGE_ACCESS_KEY_ID = origAccessKey; else delete process.env.STORAGE_ACCESS_KEY_ID;
    if (origSecretKey) process.env.STORAGE_SECRET_ACCESS_KEY = origSecretKey; else delete process.env.STORAGE_SECRET_ACCESS_KEY;
  }
});

