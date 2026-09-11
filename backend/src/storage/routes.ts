import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { z } from "zod";
import { verifyAccessToken, type TenantAccessTokenClaims } from "../auth/jwt";
import { requireAuth, requireRole } from "../auth/middleware";
import { storageObjects } from "../db/schema";
import { withTenant } from "../db/tenant";
import { internalError, notFoundError, validationError } from "../http/errors";
import {
  getStorageProvider,
  MAX_STORAGE_BYTES,
  verifyStorageToken,
  type StorageTokenPayload,
} from "./provider";

const uploadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    contentType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    size: z.number().int().positive().max(MAX_STORAGE_BYTES),
    purpose: z.enum(["student", "parent_request", "timeline", "document"]),
  })
  .strict();

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

async function storageContentAuth(context: Context, next: Next) {
  const token = context.req.query("token");
  const authHeader = context.req.header("Authorization");

  if (token) {
    const verified = await verifyStorageToken(token);
    if (!verified) {
      return context.json(
        {
          success: false,
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or expired storage token",
          },
        },
        401,
      );
    }
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const claims = await verifyAccessToken(authHeader.slice(7));
        if (claims.school_id && claims.school_id !== verified.schoolId) {
          return context.json(
            {
              success: false,
              data: null,
              error: {
                code: "FORBIDDEN",
                message: "Cross-tenant access forbidden",
              },
            },
            403,
          );
        }
      } catch {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired token",
            },
          },
          401,
        );
      }
    }
    context.set("storageAuth" as any, {
      type: "signed_token" as const,
      payload: verified,
    });
    return await next();
  }

  const response = await requireAuth(context, async () => {
    await requireRole(
      "school_admin",
      "teacher",
      "staff",
      "parent",
    )(context, next);
  });
  return response;
}

function getStorageAuth(context: Context): {
  isSignedToken: boolean;
  schoolId: string;
  ownerId: string;
  action?: "upload" | "download";
  objectId?: string;
  role?: string;
} {
  const storageAuth = context.get("storageAuth" as any) as
    { type: "signed_token"; payload: StorageTokenPayload } | undefined;
  if (storageAuth?.type === "signed_token") {
    return {
      isSignedToken: true,
      schoolId: storageAuth.payload.schoolId,
      ownerId: storageAuth.payload.ownerId,
      action: storageAuth.payload.action,
      objectId: storageAuth.payload.objectId,
    };
  }
  const claims = claimsOf(context);
  return {
    isSignedToken: false,
    schoolId: claims.school_id,
    ownerId: claims.sub,
    role: claims.role,
  };
}

export const storageRoutes = new Hono();

storageRoutes.post(
  "/upload-url",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return validationError(context, "Invalid upload request");
    }
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(context, "Invalid upload request");
    }
    const claims = claimsOf(context);
    const id = crypto.randomUUID();
    const safeFileName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${claims.sub}/${id}-${safeFileName}`;
    const provider = getStorageProvider();

    try {
      await withTenant(claims.school_id, async (tx) => {
        await tx.insert(storageObjects).values({
          id,
          schoolId: claims.school_id,
          ownerId: claims.sub,
          objectKey,
          bucket: process.env.STORAGE_BUCKET?.trim() || "kinder-files",
          originalName: parsed.data.fileName,
          contentType: parsed.data.contentType,
          size: parsed.data.size,
          status: "pending",
        });
      });

      const uploadUrl = await provider.createUploadUrl(
        claims.school_id,
        id,
        objectKey,
        claims.sub,
        {
          expiresIn: 900,
          contentType: parsed.data.contentType,
        },
      );

      return context.json(
        {
          success: true,
          data: {
            id,
            objectKey,
            uploadUrl,
            method: "PUT",
            expiresIn: 900,
          },
          error: null,
        },
        201,
      );
    } catch {
      return internalError(context);
    }
  },
);

storageRoutes.put(
  "/objects/:id/content",
  storageContentAuth,
  async (context) => {
    const auth = getStorageAuth(context);
    const idParam = context.req.param("id")!;

    if (auth.isSignedToken) {
      if (auth.action !== "upload") {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "FORBIDDEN",
              message: "Token action not permitted for upload",
            },
          },
          403,
        );
      }
      if (auth.objectId !== idParam) {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "FORBIDDEN",
              message: "Token does not match requested object",
            },
          },
          403,
        );
      }
    }

    const provider = getStorageProvider();

    try {
      const result = await withTenant(auth.schoolId, async (tx) => {
        const [object] = await tx
          .select()
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.id, idParam),
              eq(storageObjects.schoolId, auth.schoolId),
            ),
          );

        if (!object || object.status === "deleted") {
          return { kind: "not_found" as const };
        }

        if (!auth.isSignedToken && object.ownerId !== auth.ownerId) {
          return { kind: "forbidden" as const };
        }

        if (object.status !== "pending") {
          return { kind: "invalid_status" as const };
        }

        const body = await context.req.raw.arrayBuffer();
        const contentType = context.req.header("content-type");
        if (
          body.byteLength !== object.size ||
          contentType !== object.contentType
        ) {
          return { kind: "invalid" as const };
        }

        await provider.putObject(
          auth.schoolId,
          object.objectKey,
          body,
          object.contentType,
        );

        const [updated] = await tx
          .update(storageObjects)
          .set({ status: "uploaded", uploadedAt: new Date() })
          .where(eq(storageObjects.id, object.id))
          .returning();

        return { kind: "uploaded" as const, object: updated };
      });

      if (result.kind === "not_found") {
        return notFoundError(context, "Storage object not found");
      }
      if (result.kind === "forbidden") {
        return context.json(
          {
            success: false,
            data: null,
            error: { code: "FORBIDDEN", message: "Forbidden" },
          },
          403,
        );
      }
      if (result.kind === "invalid_status") {
        return validationError(context, "Storage object is not pending upload");
      }
      if (result.kind === "invalid") {
        return validationError(
          context,
          "Uploaded content does not match metadata",
        );
      }

      return context.json({ success: true, data: result.object, error: null });
    } catch {
      return internalError(context);
    }
  },
);

storageRoutes.get(
  "/objects/:id/content",
  storageContentAuth,
  async (context) => {
    const auth = getStorageAuth(context);
    const idParam = context.req.param("id")!;

    if (auth.isSignedToken) {
      if (auth.action !== "download") {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "FORBIDDEN",
              message: "Token action not permitted for download",
            },
          },
          403,
        );
      }
      if (auth.objectId !== idParam) {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "FORBIDDEN",
              message: "Token does not match requested object",
            },
          },
          403,
        );
      }
    }

    const provider = getStorageProvider();

    try {
      const object = await withTenant(auth.schoolId, async (tx) => {
        const [row] = await tx
          .select()
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.id, idParam),
              eq(storageObjects.schoolId, auth.schoolId),
            ),
          );
        return row ?? null;
      });

      if (
        !object ||
        object.status === "deleted" ||
        object.status !== "uploaded"
      ) {
        return notFoundError(context, "Storage object not found");
      }

      const file = await provider.getObject(auth.schoolId, object.objectKey);
      if (!file) {
        return notFoundError(context, "Storage object content not found");
      }

      const stream = file.stream();
      return new Response(stream, {
        headers: {
          "content-type": object.contentType,
          "content-length": String(object.size),
          "cache-control": "private, max-age=300",
        },
      });
    } catch {
      return internalError(context);
    }
  },
);

storageRoutes.get(
  "/objects/:id",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    const claims = claimsOf(context);
    const idParam = context.req.param("id")!;
    const provider = getStorageProvider();

    try {
      const object = await withTenant(claims.school_id, async (tx) => {
        const [row] = await tx
          .select()
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.id, idParam),
              eq(storageObjects.schoolId, claims.school_id),
            ),
          );
        return row ?? null;
      });

      if (!object || object.status === "deleted") {
        return notFoundError(context, "Storage object not found");
      }

      const downloadUrl = await provider.createDownloadUrl(
        claims.school_id,
        object.id,
        object.objectKey,
        object.ownerId,
        { expiresIn: 900 },
      );

      return context.json({
        success: true,
        data: {
          id: object.id,
          objectKey: object.objectKey,
          originalName: object.originalName,
          contentType: object.contentType,
          size: object.size,
          status: object.status,
          createdAt: object.createdAt,
          uploadedAt: object.uploadedAt,
          downloadUrl,
        },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

storageRoutes.delete(
  "/objects/:id",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    const claims = claimsOf(context);
    const idParam = context.req.param("id")!;
    const provider = getStorageProvider();

    try {
      const result = await withTenant(claims.school_id, async (tx) => {
        const [object] = await tx
          .select()
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.id, idParam),
              eq(storageObjects.schoolId, claims.school_id),
            ),
          );

        if (!object || object.status === "deleted") {
          return { kind: "not_found" as const };
        }

        const isOwner = object.ownerId === claims.sub;
        const isAdmin = claims.role === "school_admin";
        if (!isOwner && !isAdmin) {
          return { kind: "forbidden" as const };
        }

        await tx
          .update(storageObjects)
          .set({ status: "deleted" })
          .where(eq(storageObjects.id, object.id));

        return { kind: "deleted" as const, objectKey: object.objectKey };
      });

      if (result.kind === "not_found") {
        return notFoundError(context, "Storage object not found");
      }
      if (result.kind === "forbidden") {
        return context.json(
          {
            success: false,
            data: null,
            error: {
              code: "FORBIDDEN",
              message: "Only owner or school admin can delete this object",
            },
          },
          403,
        );
      }

      await provider.deleteObject(claims.school_id, result.objectKey);

      return context.json({
        success: true,
        data: { id: idParam, status: "deleted" },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

storageRoutes.post(
  "/objects/:id/download-url",
  requireAuth,
  requireRole("school_admin", "teacher", "staff", "parent"),
  async (context) => {
    const claims = claimsOf(context);
    const idParam = context.req.param("id")!;
    const provider = getStorageProvider();

    try {
      const object = await withTenant(claims.school_id, async (tx) => {
        const [row] = await tx
          .select()
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.id, idParam),
              eq(storageObjects.schoolId, claims.school_id),
            ),
          );
        return row ?? null;
      });

      if (!object || object.status === "deleted") {
        return notFoundError(context, "Storage object not found");
      }

      const downloadUrl = await provider.createDownloadUrl(
        claims.school_id,
        object.id,
        object.objectKey,
        object.ownerId,
        { expiresIn: 900 },
      );

      return context.json({
        success: true,
        data: {
          downloadUrl,
          expiresIn: 900,
        },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);
