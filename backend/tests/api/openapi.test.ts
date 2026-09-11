import { expect, test } from "bun:test";
import { app } from "../../src/server";

test("GET /openapi.json exposes the public API contract", async () => {
  const response = await app.request("/openapi.json");
  const document = (await response.json()) as {
    openapi: string;
    info: { title: string };
    paths: Record<string, Record<string, unknown>>;
    components: {
      securitySchemes: { bearerAuth: { type: string } };
    };
  };

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(document.openapi).toBe("3.0.3");
  expect(document.info.title).toBe("KinderNewGenz API");
  expect(document.paths["/api/v1/auth/login"]?.post).toBeDefined();
  expect(document.paths["/api/v1/school/students"]?.get).toBeDefined();
  expect(document.paths["/api/v1/parent/children"]?.get).toBeDefined();
  expect(document.components.securitySchemes.bearerAuth.type).toBe("http");
});

test("GET /docs serves Swagger UI configured with the OpenAPI document", async () => {
  const response = await app.request("/docs");
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("swagger-ui");
  expect(html).toContain("/openapi.json");
});
