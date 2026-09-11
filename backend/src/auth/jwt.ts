import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { z } from "zod";

function requiredAccessTokenSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("ACCESS_TOKEN_SECRET is required");
  }
  if (secret.length < 32) {
    throw new Error("ACCESS_TOKEN_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

const ACCESS_TOKEN_SECRET = requiredAccessTokenSecret();

export type TenantAccessTokenClaims = {
  sub: string;
  membership_id: string;
  school_id: string;
  role: "school_admin" | "teacher" | "staff" | "parent";
  session_version: number;
  jti?: string;
  exp?: number;
};

export type SystemAdminAccessTokenClaims = {
  sub: string;
  role: "system_admin";
  session_version: number;
  school_id?: string;
  support_session_id?: string;
  scope?: "read_only";
  jti?: string;
  exp?: number;
};

export type ContextSelectionAccessTokenClaims = {
  sub: string;
  role: "context_selection";
  scope: "context_selection";
  session_version: number;
  jti?: string;
  exp?: number;
};

export type AccessTokenClaims =
  | TenantAccessTokenClaims
  | SystemAdminAccessTokenClaims
  | ContextSelectionAccessTokenClaims;

const tenantClaimsSchema = z.object({
  sub: z.string().min(1),
  membership_id: z.string().min(1),
  school_id: z.string().min(1),
  role: z.enum(["school_admin", "teacher", "staff", "parent"]),
  session_version: z.number().int().nonnegative(),
});

const systemAdminClaimsSchema = z.object({
  sub: z.string().min(1),
  role: z.literal("system_admin"),
  session_version: z.number().int().nonnegative(),
  school_id: z.string().min(1).optional(),
  support_session_id: z.string().min(1).optional(),
  scope: z.literal("read_only").optional(),
});

const contextSelectionClaimsSchema = z.object({
  sub: z.string().min(1),
  role: z.literal("context_selection"),
  scope: z.literal("context_selection"),
  session_version: z.number().int().nonnegative(),
});

const accessTokenClaimsSchema = z.union([
  tenantClaimsSchema,
  systemAdminClaimsSchema,
  contextSelectionClaimsSchema,
]);

export async function createAccessToken(
  claims: Omit<TenantAccessTokenClaims, "jti" | "exp"> & {
    expiresIn?: string;
  },
): Promise<string> {
  const { expiresIn = "15m", ...payload } = claims;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setSubject(claims.sub)
    .setExpirationTime(expiresIn)
    .sign(ACCESS_TOKEN_SECRET);
}

export async function createSystemAdminToken(
  claims: Omit<SystemAdminAccessTokenClaims, "jti" | "exp"> & {
    expiresIn?: string;
  },
): Promise<string> {
  const { expiresIn = "15m", ...payload } = claims;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setSubject(claims.sub)
    .setExpirationTime(expiresIn)
    .sign(ACCESS_TOKEN_SECRET);
}

export async function createContextSelectionToken(
  claims: Omit<ContextSelectionAccessTokenClaims, "jti" | "exp"> & {
    expiresIn?: string;
  },
): Promise<string> {
  const { expiresIn = "5m", ...payload } = claims;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setSubject(claims.sub)
    .setExpirationTime(expiresIn)
    .sign(ACCESS_TOKEN_SECRET);
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims & JWTPayload> {
  const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET);
  const claims = accessTokenClaimsSchema.parse(payload);
  return { ...payload, ...claims } as AccessTokenClaims & JWTPayload;
}
