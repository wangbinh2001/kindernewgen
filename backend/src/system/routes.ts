import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireSystemAdmin } from "../auth/middleware";
import { db } from "../db";
import { schools, systemAdmins } from "../db/schema";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const phoneSchema = z.string().regex(/^0\d{9}$/);
const adminCreateSchema = z
  .object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
    displayName: z.string().trim().min(1),
    phone: phoneSchema.optional(),
  })
  .strict();
const adminUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
const adminStatusSchema = z
  .object({ status: z.enum(["active", "locked"]) })
  .strict();
const schoolCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    phone: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    address: z.string().trim().min(1).optional(),
  })
  .strict();
const schoolUpdateSchema = schoolCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
const schoolStatusSchema = z
  .object({ status: z.enum(["active", "suspended"]) })
  .strict();

async function readJson(context: Context) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function publicAdmin(admin: typeof systemAdmins.$inferSelect) {
  const { passwordHash: _passwordHash, ...data } = admin;
  return data;
}

export const systemRoutes = new Hono();

systemRoutes.get(
  "/admins",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    try {
      const data = await db.select().from(systemAdmins);
      return context.json({
        success: true,
        data: data.map(publicAdmin),
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

systemRoutes.post(
  "/admins",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = adminCreateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    try {
      const [admin] = await db
        .insert(systemAdmins)
        .values({
          id: crypto.randomUUID(),
          username: parsed.data.username,
          passwordHash: await Bun.password.hash(parsed.data.password, {
            algorithm: "argon2id",
          }),
          displayName: parsed.data.displayName,
          phone: parsed.data.phone,
        })
        .returning();
      return context.json(
        { success: true, data: publicAdmin(admin!), error: null },
        201,
      );
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Username already exists")
        : internalError(context);
    }
  },
);

systemRoutes.patch(
  "/admins/:id",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = adminUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    try {
      const [admin] = await db
        .update(systemAdmins)
        .set(parsed.data)
        .where(eq(systemAdmins.id, context.req.param("id")!))
        .returning();
      return admin
        ? context.json({ success: true, data: publicAdmin(admin), error: null })
        : notFoundError(context, "System admin not found");
    } catch {
      return internalError(context);
    }
  },
);

systemRoutes.patch(
  "/admins/:id/status",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = adminStatusSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    try {
      const [admin] = await db
        .update(systemAdmins)
        .set({ status: parsed.data.status })
        .where(eq(systemAdmins.id, context.req.param("id")!))
        .returning();
      return admin
        ? context.json({ success: true, data: publicAdmin(admin), error: null })
        : notFoundError(context, "System admin not found");
    } catch {
      return internalError(context);
    }
  },
);

systemRoutes.get(
  "/schools",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    try {
      const data = await db.select().from(schools);
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

systemRoutes.post(
  "/schools",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = schoolCreateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    try {
      const [school] = await db
        .insert(schools)
        .values({
          id: crypto.randomUUID(),
          ...parsed.data,
          createdBy: context.get("auth").claims.sub,
        })
        .returning();
      return context.json({ success: true, data: school, error: null }, 201);
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "School name already exists")
        : internalError(context);
    }
  },
);

systemRoutes.get(
  "/schools/:id",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    try {
      const [school] = await db
        .select()
        .from(schools)
        .where(eq(schools.id, context.req.param("id")!));
      return school
        ? context.json({ success: true, data: school, error: null })
        : notFoundError(context, "School not found");
    } catch {
      return internalError(context);
    }
  },
);

systemRoutes.patch(
  "/schools/:id",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = schoolUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    try {
      const [school] = await db
        .update(schools)
        .set(parsed.data)
        .where(eq(schools.id, context.req.param("id")!))
        .returning();
      if (!school) return notFoundError(context, "School not found");
      return context.json({ success: true, data: school, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "School name already exists")
        : internalError(context);
    }
  },
);

systemRoutes.patch(
  "/schools/:id/status",
  requireAuth,
  requireSystemAdmin,
  async (context) => {
    const parsed = schoolStatusSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    try {
      const [school] = await db
        .update(schools)
        .set({ status: parsed.data.status })
        .where(eq(schools.id, context.req.param("id")!))
        .returning();
      return school
        ? context.json({ success: true, data: school, error: null })
        : notFoundError(context, "School not found");
    } catch {
      return internalError(context);
    }
  },
);
