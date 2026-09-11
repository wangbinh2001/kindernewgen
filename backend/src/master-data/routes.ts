import { Hono } from "hono";
import { vietnamAddresses } from "../constants/vietnam-addresses";
import { validationError } from "../http/errors";

export const masterDataRoutes = new Hono();

masterDataRoutes.get("/addresses/provinces", (context) => {
  const provinces = Object.keys(vietnamAddresses).sort((left, right) =>
    left.localeCompare(right),
  );
  return context.json({ success: true, data: provinces, error: null });
});

masterDataRoutes.get("/addresses/wards", (context) => {
  const province = context.req.query("province")?.trim();
  if (
    !province ||
    !Object.prototype.hasOwnProperty.call(vietnamAddresses, province)
  ) {
    return validationError(context, "Unknown province");
  }

  const wards = vietnamAddresses[province as keyof typeof vietnamAddresses];
  return context.json({
    success: true,
    data: [...wards].sort((left, right) => left.localeCompare(right)),
    error: null,
  });
});
