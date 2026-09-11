import { expect, test } from "bun:test";
import { app } from "../../src/server";
import {
  isProvince,
  isWardOfProvince,
} from "../../src/validation/vietnam-address";

const HANOI = "Thành phố Hà Nội";

test("lists sorted Vietnamese provinces without administrative codes", async () => {
  const response = await app.request("/api/v1/master-data/addresses/provinces");

  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    success: boolean;
    data: string[];
    error: unknown;
  };
  expect(body.success).toBe(true);
  expect(body.error).toBeNull();
  expect(body.data).toHaveLength(34);
  expect(body.data).toEqual([...body.data].sort((a, b) => a.localeCompare(b)));
  expect(body.data).toContain(HANOI);
  expect(body.data.every((province) => !province.includes("Mã"))).toBe(true);
});

test("lists sorted wards for a selected province", async () => {
  const query = new URLSearchParams({ province: HANOI });
  const response = await app.request(
    `/api/v1/master-data/addresses/wards?${query.toString()}`,
  );

  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    success: boolean;
    data: string[];
    error: unknown;
  };
  expect(body.success).toBe(true);
  expect(body.error).toBeNull();
  expect(body.data.length).toBeGreaterThan(1);
  expect(body.data).toEqual([...body.data].sort((a, b) => a.localeCompare(b)));
  expect(body.data.every((ward) => ward === ward.trim())).toBe(true);
});

test("rejects an unknown province for the wards dropdown", async () => {
  const response = await app.request(
    "/api/v1/master-data/addresses/wards?province=Tỉnh%20Không%20Tồn%20Tại",
  );

  expect(response.status).toBe(400);
  const body = (await response.json()) as {
    success: boolean;
    data: null;
    error: { code: string };
  };
  expect(body.success).toBe(false);
  expect(body.data).toBeNull();
  expect(body.error.code).toBe("VALIDATION_ERROR");
});

test("validates province and ward membership", () => {
  expect(isProvince(HANOI)).toBe(true);
  expect(isProvince("Tỉnh Không Tồn Tại")).toBe(false);
  expect(isWardOfProvince(HANOI, "Phường Ba Đình")).toBe(true);
  expect(isWardOfProvince(HANOI, "Xã Không Thuộc Hà Nội")).toBe(false);
});
