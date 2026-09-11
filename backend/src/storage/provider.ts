import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHmac, createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const MAX_STORAGE_BYTES = 10 * 1024 * 1024;

function getStorageSecret(): Uint8Array {
  const secret =
    process.env.ACCESS_TOKEN_SECRET?.trim() ||
    "default-very-long-access-token-secret-for-kinder-app-32chars";
  return new TextEncoder().encode(secret);
}

export type StorageTokenPayload = {
  objectId: string;
  schoolId: string;
  ownerId: string;
  sub?: string;
  action: "upload" | "download";
  expiresAt: number;
};

export async function createStorageToken(payload: {
  objectId: string;
  schoolId: string;
  ownerId: string;
  action: "upload" | "download";
  expiresInSeconds?: number;
}): Promise<string> {
  const expiresInSeconds = payload.expiresInSeconds ?? 900;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expiresInSeconds;

  return await new SignJWT({
    objectId: payload.objectId,
    schoolId: payload.schoolId,
    ownerId: payload.ownerId,
    action: payload.action,
    expiresAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.ownerId)
    .setExpirationTime(expiresAt)
    .sign(getStorageSecret());
}

export async function verifyStorageToken(
  token: string,
): Promise<StorageTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getStorageSecret());
    const objectId = payload.objectId as string;
    const schoolId = payload.schoolId as string;
    const ownerId = (payload.ownerId || payload.sub) as string;
    const action = payload.action as "upload" | "download";
    const expiresAt = (typeof payload.expiresAt === "number"
      ? payload.expiresAt
      : payload.exp) as number;

    if (!objectId || !schoolId || !ownerId || !action || !expiresAt) {
      return null;
    }
    if (action !== "upload" && action !== "download") {
      return null;
    }
    if (expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      objectId,
      schoolId,
      ownerId,
      sub: ownerId,
      action,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function root() {
  return (
    process.env.STORAGE_LOCAL_ROOT?.trim() || join(process.cwd(), ".storage")
  );
}

export function storagePath(schoolId: string, objectKey: string) {
  const safeKey = objectKey.replaceAll("/", "\\").replaceAll("..", "_");
  return join(root(), schoolId, safeKey);
}

export async function writeObject(
  schoolId: string,
  objectKey: string,
  body: ArrayBuffer,
) {
  const path = storagePath(schoolId, objectKey);
  await mkdir(join(path, ".."), { recursive: true });
  await Bun.write(path, body);
}

export async function readObject(schoolId: string, objectKey: string) {
  const file = Bun.file(storagePath(schoolId, objectKey));
  return (await file.exists()) ? file : null;
}

export type StorageUrlOptions = {
  expiresIn?: number;
  contentType?: string;
};

export type StorageUrlParams = {
  schoolId: string;
  objectId: string;
  objectKey: string;
  ownerId?: string;
  expiresIn?: number;
  contentType?: string;
};

export interface StorageProvider {
  createUploadUrl(
    schoolIdOrParams: string | StorageUrlParams,
    objectId?: string,
    objectKey?: string,
    ownerId?: string,
    options?: StorageUrlOptions,
  ): Promise<string>;

  createDownloadUrl(
    schoolIdOrParams: string | StorageUrlParams,
    objectId?: string,
    objectKey?: string,
    ownerId?: string,
    options?: StorageUrlOptions,
  ): Promise<string>;

  putObject(
    schoolId: string,
    objectKey: string,
    body: ArrayBuffer | Uint8Array,
    contentType?: string,
  ): Promise<void>;

  getObject(
    schoolId: string,
    objectKey: string,
  ): Promise<{
    stream(): ReadableStream;
    size?: number;
    contentType?: string;
  } | null>;

  deleteObject(schoolId: string, objectKey: string): Promise<void>;
}

function normalizeUrlParams(
  schoolIdOrParams: string | StorageUrlParams,
  objectId?: string,
  objectKey?: string,
  ownerId?: string,
  options?: StorageUrlOptions,
): StorageUrlParams {
  if (typeof schoolIdOrParams === "object") {
    return schoolIdOrParams;
  }
  return {
    schoolId: schoolIdOrParams,
    objectId: objectId!,
    objectKey: objectKey!,
    ownerId: ownerId || "",
    expiresIn: options?.expiresIn,
    contentType: options?.contentType,
  };
}

export class LocalStorageProvider implements StorageProvider {
  async createUploadUrl(
    schoolIdOrParams: string | StorageUrlParams,
    objectId?: string,
    objectKey?: string,
    ownerId?: string,
    options?: StorageUrlOptions,
  ): Promise<string> {
    const params = normalizeUrlParams(
      schoolIdOrParams,
      objectId,
      objectKey,
      ownerId,
      options,
    );
    const token = await createStorageToken({
      objectId: params.objectId,
      schoolId: params.schoolId,
      ownerId: params.ownerId || "",
      action: "upload",
      expiresInSeconds: params.expiresIn ?? 900,
    });
    return `/api/v1/school/storage/objects/${params.objectId}/content?token=${token}`;
  }

  async createDownloadUrl(
    schoolIdOrParams: string | StorageUrlParams,
    objectId?: string,
    objectKey?: string,
    ownerId?: string,
    options?: StorageUrlOptions,
  ): Promise<string> {
    const params = normalizeUrlParams(
      schoolIdOrParams,
      objectId,
      objectKey,
      ownerId,
      options,
    );
    const token = await createStorageToken({
      objectId: params.objectId,
      schoolId: params.schoolId,
      ownerId: params.ownerId || "",
      action: "download",
      expiresInSeconds: params.expiresIn ?? 900,
    });
    return `/api/v1/school/storage/objects/${params.objectId}/content?token=${token}`;
  }

  async putObject(
    schoolId: string,
    objectKey: string,
    body: ArrayBuffer | Uint8Array,
  ): Promise<void> {
    const buf =
      body instanceof ArrayBuffer
        ? body
        : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    await writeObject(schoolId, objectKey, buf as ArrayBuffer);
  }

  async getObject(schoolId: string, objectKey: string) {
    const file = await readObject(schoolId, objectKey);
    if (!file) return null;
    return file;
  }

  async deleteObject(schoolId: string, objectKey: string): Promise<void> {
    const path = storagePath(schoolId, objectKey);
    const file = Bun.file(path);
    if (await file.exists()) {
      try {
        await unlink(path);
      } catch {}
    }
  }
}

function sha256(data: string | Buffer | ArrayBuffer | Uint8Array): string {
  return createHash("sha256")
    .update(data as any)
    .digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Buffer {
  const kDate = hmac("AWS4" + key, dateStamp);
  const kRegion = createHmac("sha256", kDate).update(regionName).digest();
  const kService = createHmac("sha256", kRegion).update(serviceName).digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
}

export class S3StorageProvider implements StorageProvider {
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor() {
    const missing: string[] = [];
    const endpoint = process.env.STORAGE_ENDPOINT?.trim();
    const region = process.env.STORAGE_REGION?.trim();
    const bucket = process.env.STORAGE_BUCKET?.trim();
    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY?.trim();

    if (!endpoint) missing.push("STORAGE_ENDPOINT");
    if (!region) missing.push("STORAGE_REGION");
    if (!bucket) missing.push("STORAGE_BUCKET");
    if (!accessKeyId) missing.push("STORAGE_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("STORAGE_SECRET_ACCESS_KEY");

    if (missing.length > 0) {
      throw new Error(
        `S3 storage provider configuration error: Missing required environment variables: ${missing.join(", ")}`,
      );
    }

    this.endpoint = endpoint!;
    this.region = region!;
    this.bucket = bucket!;
    this.accessKeyId = accessKeyId!;
    this.secretAccessKey = secretAccessKey!;
  }

  private buildPresignedUrl(
    method: "GET" | "PUT",
    key: string,
    expiresIn = 900,
  ): string {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const cleanEndpoint = this.endpoint.replace(/\/+$/, "");
    const host = new URL(cleanEndpoint).host;
    const s3Key = key.replace(/^\/+/, "");

    const query = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    });
    query.sort();
    const canonicalQuery = query.toString();
    const canonicalUri = `/${this.bucket}/${s3Key}`;
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/${this.region}/s3/aws4_request\n${sha256(canonicalRequest)}`;
    const signingKey = getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      "s3",
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");

    return `${cleanEndpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private async s3Request(
    method: "GET" | "PUT" | "DELETE",
    key: string,
    body?: ArrayBuffer | Uint8Array,
    contentType?: string,
  ): Promise<Response> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const cleanEndpoint = this.endpoint.replace(/\/+$/, "");
    const host = new URL(cleanEndpoint).host;
    const s3Key = key.replace(/^\/+/, "");
    const canonicalUri = `/${this.bucket}/${s3Key}`;
    const payloadHash = body ? sha256(body) : sha256("");

    const headers: Record<string, string> = {
      host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };
    if (contentType) {
      headers["content-type"] = contentType;
    }
    const signedHeaderKeys = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${headers[k]}\n`)
      .join("");
    const signedHeaders = signedHeaderKeys.join(";");

    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/${this.region}/s3/aws4_request\n${sha256(canonicalRequest)}`;
    const signingKey = getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      "s3",
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");

    headers["authorization"] =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return await fetch(`${cleanEndpoint}${canonicalUri}`, {
      method,
      headers,
      body: body as any,
    });
  }

  async createUploadUrl(
    schoolIdOrParams: string | StorageUrlParams,
    objectId?: string,
    objectKey?: string,
    ownerId?: string,
    options?: StorageUrlOptions,
  ): Promise<string> {
    const params = normalizeUrlParams(
      schoolIdOrParams,
      objectId,
      objectKey,
      ownerId,
      options,
    );
    const fullKey = `${params.schoolId}/${params.objectKey}`;
    return this.buildPresignedUrl("PUT", fullKey, params.expiresIn ?? 900);
  }

  async createDownloadUrl(
    schoolIdOrParams: string | StorageUrlParams,
    objectId?: string,
    objectKey?: string,
    ownerId?: string,
    options?: StorageUrlOptions,
  ): Promise<string> {
    const params = normalizeUrlParams(
      schoolIdOrParams,
      objectId,
      objectKey,
      ownerId,
      options,
    );
    const fullKey = `${params.schoolId}/${params.objectKey}`;
    return this.buildPresignedUrl("GET", fullKey, params.expiresIn ?? 900);
  }

  async putObject(
    schoolId: string,
    objectKey: string,
    body: ArrayBuffer | Uint8Array,
    contentType?: string,
  ): Promise<void> {
    const fullKey = `${schoolId}/${objectKey}`;
    const res = await this.s3Request("PUT", fullKey, body, contentType);
    if (!res.ok) {
      throw new Error(
        `S3 putObject failed with status ${res.status}: ${await res.text()}`,
      );
    }
  }

  async getObject(schoolId: string, objectKey: string) {
    const fullKey = `${schoolId}/${objectKey}`;
    const res = await this.s3Request("GET", fullKey);
    if (!res.ok || !res.body) return null;
    return {
      stream: () => res.body!,
      size: Number(res.headers.get("content-length")) || undefined,
      contentType: res.headers.get("content-type") || undefined,
    };
  }

  async deleteObject(schoolId: string, objectKey: string): Promise<void> {
    const fullKey = `${schoolId}/${objectKey}`;
    const res = await this.s3Request("DELETE", fullKey);
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `S3 deleteObject failed with status ${res.status}: ${await res.text()}`,
      );
    }
  }
}

export function getStorageProvider(): StorageProvider {
  const providerType = (process.env.STORAGE_PROVIDER || "local")
    .trim()
    .toLowerCase();
  if (providerType === "s3") {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}
