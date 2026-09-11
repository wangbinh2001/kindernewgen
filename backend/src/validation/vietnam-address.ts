import { z } from "zod";
import { vietnamAddresses } from "../constants/vietnam-addresses";

export function isProvince(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(vietnamAddresses, value.trim());
}

export function isWardOfProvince(province: string, ward: string): boolean {
  const wards =
    vietnamAddresses[province.trim() as keyof typeof vietnamAddresses];
  return Boolean(wards && (wards as readonly string[]).includes(ward.trim()));
}

export const vietnamAddressPairSchema = z
  .object({
    province: z.string().trim().min(1),
    commune: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (!isProvince(value.province)) {
      context.addIssue({
        code: "custom",
        path: ["province"],
        message: "Unknown province",
      });
      return;
    }
    if (!isWardOfProvince(value.province, value.commune)) {
      context.addIssue({
        code: "custom",
        path: ["commune"],
        message: "Ward does not belong to province",
      });
    }
  });

export function addAddressPairIssue(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
  provinceKey: string,
  communeKey: string,
) {
  const province = value[provinceKey];
  const commune = value[communeKey];
  if (province === undefined && commune === undefined) return;
  if (typeof province !== "string" || typeof commune !== "string") {
    context.addIssue({
      code: "custom",
      path: [provinceKey],
      message: "Province and commune must be provided together",
    });
    return;
  }
  const parsed = vietnamAddressPairSchema.safeParse({ province, commune });
  for (const issue of parsed.error?.issues ?? []) {
    context.addIssue({
      code: "custom",
      path: [issue.path[0] === "province" ? provinceKey : communeKey],
      message: issue.message,
    });
  }
}
