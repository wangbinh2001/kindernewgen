import { expect, test } from "bun:test";
import { schoolInfoValueSchema } from "../../src/settings/routes";
import { studentAddressFieldsSchema } from "../../src/students/routes";

test("student address fields accept a valid province and commune pair", () => {
  const parsed = studentAddressFieldsSchema.safeParse({
    permanentProvince: "Thành phố Hà Nội",
    permanentCommune: "Phường Ba Đình",
  });

  expect(parsed.success).toBe(true);
});

test("student address fields reject a commune from another province", () => {
  const parsed = studentAddressFieldsSchema.safeParse({
    permanentProvince: "Thành phố Hà Nội",
    permanentCommune: "Phường Bến Nghé",
  });

  expect(parsed.success).toBe(false);
});

test("school-info rejects an unknown province and commune", () => {
  const parsed = schoolInfoValueSchema.safeParse({
    name: "Little Stars",
    province: "Tỉnh Không Tồn Tại",
    commune: "Xã Không Tồn Tại",
  });

  expect(parsed.success).toBe(false);
});
