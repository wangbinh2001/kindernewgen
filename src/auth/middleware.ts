import type { Context, Next } from "hono";
import { verifyAccessToken, type AccessTokenClaims } from "./jwt";

export type AuthContext = {
  claims: AccessTokenClaims;
};

export async function requireAuth(context: Context, next: Next) {
  const authorization = context.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
      },
      401,
    );
  }

  try {
    const claims = await verifyAccessToken(authorization.slice(7));
    context.set("auth", { claims });
    await next();
  } catch {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      },
      401,
    );
  }
}
