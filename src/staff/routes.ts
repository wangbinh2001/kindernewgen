import { and, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { withTenant } from "../db/tenant";
import {
  classes,
  schoolMemberships,
  teacherAssignments,
  users,
} from "../db/schema";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const createSchema = z
  .object({
    globalPhone: z.string().regex(/^0\d{9}$/),
    displayName: z.string().trim().min(1),
    role: z.enum(["teacher", "staff"]),
    password: z.string().min(6).optional(),
    email: z.string().email().optional(),
  })
  .strict();
const statusSchema = z
  .object({ status: z.enum(["active", "locked"]) })
  .strict();
const assignSchema = z.object({ classId: z.string().min(1) }).strict();

async function readJson(context: Parameters<typeof requireAuth>[0]) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function schoolIdOf(context: Parameters<typeof requireAuth>[0]) {
  return (context.get("auth").claims as TenantAccessTokenClaims).school_id;
}

export const staffRoutes = new Hono();
staffRoutes.use("*", requireAuth, requireRole("school_admin"));

staffRoutes.get("/", async (context) => {
  const schoolId = schoolIdOf(context);
  try {
    const data = await withTenant(schoolId, (tx) =>
      tx
        .select({
          userId: users.id,
          globalPhone: users.globalPhone,
          username: users.username,
          displayName: users.displayName,
          email: users.email,
          membershipId: schoolMemberships.id,
          role: schoolMemberships.role,
          status: schoolMemberships.status,
        })
        .from(schoolMemberships)
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(
          and(
            eq(schoolMemberships.schoolId, schoolId),
            inArray(schoolMemberships.role, ["teacher", "staff"]),
          ),
        ),
    );
    return context.json({ success: true, data, error: null });
  } catch {
    return internalError(context);
  }
});

staffRoutes.post("/", async (context) => {
  const parsed = createSchema.safeParse(await readJson(context));
  if (!parsed.success) return validationError(context, "Invalid staff data");
  const schoolId = schoolIdOf(context);
  try {
    const data = await withTenant(schoolId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.globalPhone, parsed.data.globalPhone));
      const user =
        existing ??
        (
          await tx
            .insert(users)
            .values({
              id: crypto.randomUUID(),
              globalPhone: parsed.data.globalPhone,
              username: parsed.data.globalPhone,
              passwordHash: await Bun.password.hash(
                parsed.data.password ?? "123456",
              ),
              displayName: parsed.data.displayName,
              email: parsed.data.email,
              mustChangePassword: true,
            })
            .returning()
        )[0]!;
      const [membership] = await tx
        .insert(schoolMemberships)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          schoolId,
          role: parsed.data.role,
          status: "active",
        })
        .returning();
      return {
        userId: user.id,
        membershipId: membership!.id,
        role: membership!.role,
      };
    });
    return context.json({ success: true, data, error: null }, 201);
  } catch (error) {
    return isUniqueViolation(error)
      ? validationError(context, "Staff membership already exists")
      : internalError(context);
  }
});

staffRoutes.patch("/:id/status", async (context) => {
  const parsed = statusSchema.safeParse(await readJson(context));
  if (!parsed.success) return validationError(context, "Invalid status");
  const schoolId = schoolIdOf(context);
  try {
    const data = await withTenant(schoolId, async (tx) => {
      const targetId = context.req.param("id")!;
      const whereClause = and(
        eq(schoolMemberships.schoolId, schoolId),
        inArray(schoolMemberships.role, ["teacher", "staff"]),
        or(
          eq(schoolMemberships.id, targetId),
          eq(schoolMemberships.userId, targetId),
        ),
      );
      const matched = await tx
        .select({ id: schoolMemberships.id })
        .from(schoolMemberships)
        .where(whereClause);
      if (matched.length === 0) return null;
      const updated = await tx
        .update(schoolMemberships)
        .set({ status: parsed.data.status })
        .where(whereClause)
        .returning();
      return updated[0];
    });
    return data
      ? context.json({ success: true, data, error: null })
      : notFoundError(context, "Staff membership not found");
  } catch {
    return internalError(context);
  }
});

staffRoutes.post("/:id/assign-class", async (context) => {
  const parsed = assignSchema.safeParse(await readJson(context));
  if (!parsed.success) return validationError(context, "classId is required");
  const schoolId = schoolIdOf(context);
  const teacherId = context.req.param("id")!;
  try {
    const data = await withTenant(schoolId, async (tx) => {
      const [teacher] = await tx
        .select({ userId: schoolMemberships.userId })
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.userId, teacherId),
            eq(schoolMemberships.schoolId, schoolId),
            eq(schoolMemberships.role, "teacher"),
          ),
        );
      const [schoolClass] = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(
          and(
            eq(classes.id, parsed.data.classId),
            eq(classes.schoolId, schoolId),
            eq(classes.status, "active"),
          ),
        );
      if (!teacher || !schoolClass) return null;
      const [assignment] = await tx
        .insert(teacherAssignments)
        .values({
          id: crypto.randomUUID(),
          schoolId,
          teacherId,
          classId: schoolClass.id,
        })
        .returning();
      await tx
        .update(classes)
        .set({ teacherId })
        .where(
          and(eq(classes.id, schoolClass.id), eq(classes.schoolId, schoolId)),
        );
      return assignment;
    });
    return data
      ? context.json({ success: true, data, error: null })
      : validationError(context, "Teacher or class not found");
  } catch (error) {
    return isUniqueViolation(error)
      ? validationError(context, "Teacher is already assigned")
      : internalError(context);
  }
});
