import { expect, test } from "bun:test";
import { app } from "../../src/server";

test("GET /health returns ok", async () => {
  const response = await app.request("/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: { status: "ok" },
    error: null,
  });
});
