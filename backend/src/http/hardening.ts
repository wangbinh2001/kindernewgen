import type { Context, MiddlewareHandler, Next } from "hono";

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitState = new Map<string, RateLimitEntry>();

async function clientKey(context: Context) {
  const ip =
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    context.req.header("x-real-ip")?.trim();
  if (ip) return ip;
  const body = await context.req.raw.clone().text();
  const identity =
    body.match(/"(?:phone|username)"\s*:\s*"([^"]+)"/)?.[1] || "anonymous";
  return `body:${identity}`;
}

function configuredNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const requestId: MiddlewareHandler = async (context, next) => {
  const supplied = context.req.header("x-request-id")?.trim();
  const id =
    supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
      ? supplied
      : crypto.randomUUID();
  context.header("X-Request-ID", id);
  await next();
};

export const securityHeaders: MiddlewareHandler = async (context, next) => {
  context.header("X-Content-Type-Options", "nosniff");
  context.header("X-Frame-Options", "DENY");
  context.header("Referrer-Policy", "no-referrer");
  context.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (process.env.NODE_ENV === "production")
    context.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  await next();
};

export const corsHeaders: MiddlewareHandler = async (context, next) => {
  const origin = context.req.header("origin");
  const configured = (
    process.env.CORS_ORIGINS ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173")
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origin && configured.includes(origin)) {
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Access-Control-Allow-Credentials", "true");
    context.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    context.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Request-ID",
    );
    context.header("Vary", "Origin");
  }
  if (context.req.method === "OPTIONS") return context.body(null, 204);
  await next();
};

export function rateLimit(
  kind: "login" | "otp" | "import" | "upload",
): MiddlewareHandler {
  return async (context, next) => {
    const windowMs = configuredNumber("RATE_LIMIT_WINDOW_SECONDS", 60) * 1000;
    const fallback =
      kind === "otp"
        ? 3
        : kind === "import"
          ? 10
          : kind === "upload"
            ? 30
            : 10;
    const envVar =
      kind === "otp"
        ? "RATE_LIMIT_OTP_MAX"
        : kind === "import"
          ? "RATE_LIMIT_IMPORT_MAX"
          : kind === "upload"
            ? "RATE_LIMIT_UPLOAD_MAX"
            : "RATE_LIMIT_LOGIN_MAX";
    const max = configuredNumber(envVar, fallback);
    const now = Date.now();
    const key = `${kind}:${await clientKey(context)}`;
    const current = rateLimitState.get(key);
    const entry =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    entry.count += 1;
    rateLimitState.set(key, entry);
    if (entry.count > max) {
      context.header(
        "Retry-After",
        String(Math.ceil((entry.resetAt - now) / 1000)),
      );
      return context.json(
        {
          success: false,
          data: null,
          error: { code: "RATE_LIMITED", message: "Too many requests" },
        },
        429,
      );
    }
    await next();
  };
}
