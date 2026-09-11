import { Hono } from "hono";
import { expect, test } from "bun:test";
import { requireAuth } from "../../src/auth/middleware";
import { createAccessToken } from "../../src/auth/jwt";

test("requireAuth rejects missing bearer token", async () => {
  const app = new Hono();
  app.get("/protected", requireAuth, (context) => context.json({ ok: true }));

  const response = await app.request("/protected");
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    data: null,
    error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
  });
});

test("requireAuth accepts valid tenant token", async () => {
  const token = await createAccessToken({
    sub: "user-1",
    membership_id: "membership-1",
    school_id: "school-1",
    role: "school_admin",
    session_version: 1,
  });

  const app = new Hono();
  app.get("/protected", requireAuth, (context) =>
    context.json({ claims: context.get("auth").claims }),
  );

  const response = await app.request("/protected", {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    claims: { school_id: "school-1" },
  });
});
