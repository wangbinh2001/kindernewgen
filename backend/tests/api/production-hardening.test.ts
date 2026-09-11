import { expect, test } from "bun:test";
import { app } from "../../src/server";

test("responses include request id and security headers", async () => {
  const response = await app.request("/health", {
    headers: { "x-request-id": "hardening-test-1" },
  });
  expect(response.headers.get("x-request-id")).toBe("hardening-test-1");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

test("CORS only allows configured origins", async () => {
  const allowed = await app.request("/health", {
    headers: { origin: "http://localhost:5173" },
  });
  const blocked = await app.request("/health", {
    headers: { origin: "https://evil.example" },
  });
  expect(allowed.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:5173",
  );
  expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
});

test("login rate limit returns 429 after the configured threshold", async () => {
  const headers = {
    "content-type": "application/json",
    "x-forwarded-for": "198.51.100.77",
  };
  let last: Response | undefined;
  for (let index = 0; index < 11; index += 1) {
    last = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: "0000000000", password: "bad" }),
    });
  }
  expect(last?.status).toBe(429);
  expect(last?.headers.get("retry-after")).not.toBeNull();
  expect(await last?.json()).toMatchObject({
    error: { code: "RATE_LIMITED" },
  });
});

test("student import rate limit returns 429 after 10 requests", async () => {
  const headers = {
    "x-forwarded-for": "198.51.100.88",
  };
  let last: Response | undefined;
  for (let index = 0; index < 11; index += 1) {
    last = await app.request("/api/v1/school/students/import", {
      method: "POST",
      headers,
    });
  }
  expect(last?.status).toBe(429);
  expect(last?.headers.get("retry-after")).not.toBeNull();
  expect(await last?.json()).toMatchObject({
    error: { code: "RATE_LIMITED" },
  });
});

test("storage upload-url rate limit returns 429 after 30 requests", async () => {
  const headers = {
    "x-forwarded-for": "198.51.100.89",
  };
  let last: Response | undefined;
  for (let index = 0; index < 31; index += 1) {
    last = await app.request("/api/v1/school/storage/upload-url", {
      method: "POST",
      headers,
    });
  }
  expect(last?.status).toBe(429);
  expect(last?.headers.get("retry-after")).not.toBeNull();
  expect(await last?.json()).toMatchObject({
    error: { code: "RATE_LIMITED" },
  });
});
