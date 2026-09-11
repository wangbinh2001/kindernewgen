import { SignJWT, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

const ACCESS_TOKEN_SECRET = new TextEncoder().encode(
  process.env.ACCESS_TOKEN_SECRET ?? "development-access-token-secret",
);

export type AccessTokenClaims = {
  sub: string;
  membership_id: string;
  school_id: string;
  role: "school_admin" | "teacher" | "staff" | "parent";
  session_version: number;
  jti?: string;
  exp?: number;
};

export async function createAccessToken(
  claims: Omit<AccessTokenClaims, "jti" | "exp"> & { expiresIn?: string },
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

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims & JWTPayload> {
  const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET);
  return payload as AccessTokenClaims & JWTPayload;
}
