import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { schoolSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { internalError, validationError } from "../http/errors";

const keySchema = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .min(1);
const valueSchema = z.record(z.string(), z.unknown());

async function readJson(context: Parameters<typeof requireAuth>[0]) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

export const settingsRoutes = new Hono();

settingsRoutes.use("*", requireAuth, requireRole("school_admin"));

settingsRoutes.get("/", async (context) => {
  const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
    .school_id;
  try {
    const rows = await withTenant(schoolId, (tx) =>
      tx
        .select()
        .from(schoolSettings)
        .where(eq(schoolSettings.schoolId, schoolId)),
    );
    const data = Object.fromEntries(
      rows.map((row) => [row.settingKey, row.settingValue]),
    );
    return context.json({ success: true, data, error: null });
  } catch {
    return internalError(context);
  }
});

settingsRoutes.put("/:key", async (context) => {
  const key = keySchema.safeParse(context.req.param("key"));
  const value = valueSchema.safeParse(await readJson(context));
  if (!key.success || !value.success)
    return validationError(context, "Invalid setting");

  const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
    .school_id;
  try {
    const [data] = await withTenant(schoolId, (tx) =>
      tx
        .insert(schoolSettings)
        .values({
          id: crypto.randomUUID(),
          schoolId,
          settingKey: key.data,
          settingValue: value.data,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schoolSettings.schoolId, schoolSettings.settingKey],
          set: { settingValue: value.data, updatedAt: new Date() },
        })
        .returning(),
    );
    return context.json({ success: true, data, error: null });
  } catch {
    return internalError(context);
  }
});
