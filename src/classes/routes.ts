import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  classStudents,
  classHistory,
  classes,
  schoolMemberships,
  schoolYears,
  students,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";

const createSchema = z
  .object({
    name: z.string().trim().min(1),
    schoolYearId: z.string().min(1),
    teacherId: z.string().min(1).nullable().optional(),
    maxStudents: z.number().int().min(1).nullable().optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .strict();
const updateSchema = createSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
const migrateSchema = z
  .object({
    targetSchoolYearId: z.string().min(1),
    newClassName: z.string().trim().min(1).optional(),
  })
  .strict();
async function readJson(context: Context) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

export const classRoutes = new Hono();
const readRoles = ["school_admin", "staff", "teacher"] as const;

async function validateYear(
  tx: TenantTransaction,
  schoolId: string,
  schoolYearId: string,
) {
  const [year] = await tx
    .select({ id: schoolYears.id, status: schoolYears.status })
    .from(schoolYears)
    .where(
      and(eq(schoolYears.id, schoolYearId), eq(schoolYears.schoolId, schoolId)),
    );
  return year && year.status !== "archived" ? year : null;
}

classRoutes.get(
  "/",
  requireAuth,
  requireRole(...readRoles),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(classes)
          .where(eq(classes.schoolId, schoolId))
          .orderBy(asc(classes.createdAt), asc(classes.id)),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

classRoutes.get(
  "/:id",
  requireAuth,
  requireRole(...readRoles),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .select()
          .from(classes)
          .where(
            and(
              eq(classes.id, context.req.param("id")!),
              eq(classes.schoolId, schoolId),
            ),
          ),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Class not found");
    } catch {
      return internalError(context);
    }
  },
);

classRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = createSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const year = await validateYear(tx, schoolId, parsed.data.schoolYearId);
        if (!year) return "invalid_year" as const;
        if (parsed.data.teacherId) {
          const [teacher] = await tx
            .select({ id: schoolMemberships.userId })
            .from(schoolMemberships)
            .where(
              and(
                eq(schoolMemberships.userId, parsed.data.teacherId),
                eq(schoolMemberships.schoolId, schoolId),
                eq(schoolMemberships.role, "teacher"),
                eq(schoolMemberships.status, "active"),
              ),
            );
          if (!teacher) return "invalid_teacher" as const;
        }
        const [created] = await tx
          .insert(classes)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            ...parsed.data,
            status: parsed.data.status ?? "active",
          })
          .returning();
        return created;
      });
      if (data === "invalid_year")
        return validationError(context, "School year is missing or archived");
      if (data === "invalid_teacher")
        return validationError(
          context,
          "Teacher is not a member of this school",
        );
      return context.json({ success: true, data, error: null }, 201);
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(
            context,
            "Class name already exists in this school year",
          )
        : internalError(context);
    }
  },
);

classRoutes.put(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = updateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [current] = await tx
          .select()
          .from(classes)
          .where(
            and(
              eq(classes.id, context.req.param("id")!),
              eq(classes.schoolId, schoolId),
            ),
          );
        if (!current) return null;
        if (parsed.data.schoolYearId) {
          const year = await validateYear(
            tx,
            schoolId,
            parsed.data.schoolYearId,
          );
          if (!year) return "invalid_year" as const;
        }
        if (parsed.data.teacherId) {
          const [teacher] = await tx
            .select({ id: schoolMemberships.userId })
            .from(schoolMemberships)
            .where(
              and(
                eq(schoolMemberships.userId, parsed.data.teacherId),
                eq(schoolMemberships.schoolId, schoolId),
                eq(schoolMemberships.role, "teacher"),
                eq(schoolMemberships.status, "active"),
              ),
            );
          if (!teacher) return "invalid_teacher" as const;
        }
        const [updated] = await tx
          .update(classes)
          .set(parsed.data)
          .where(eq(classes.id, current.id))
          .returning();
        return updated;
      });
      if (data === null) return notFoundError(context, "Class not found");
      if (data === "invalid_year")
        return validationError(context, "School year is missing or archived");
      if (data === "invalid_teacher")
        return validationError(
          context,
          "Teacher is not a member of this school",
        );
      return context.json({ success: true, data, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(
            context,
            "Class name already exists in this school year",
          )
        : internalError(context);
    }
  },
);

classRoutes.delete(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [classRow] = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(
            and(
              eq(classes.id, context.req.param("id")!),
              eq(classes.schoolId, schoolId),
            ),
          );
        if (!classRow) return "missing" as const;
        const [enrollment] = await tx
          .select({ id: classStudents.id })
          .from(classStudents)
          .where(
            and(
              eq(classStudents.classId, classRow.id),
              isNull(classStudents.leftAt),
            ),
          );
        if (enrollment) return "has_students" as const;
        await tx.delete(classes).where(eq(classes.id, classRow.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Class not found");
      if (result === "has_students") {
        return validationError(context, "Class has students");
      }
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);

classRoutes.post(
  "/:id/archive",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const [data] = await withTenant(schoolId, (tx) =>
        tx
          .update(classes)
          .set({ status: "archived" })
          .where(
            and(
              eq(classes.id, context.req.param("id")!),
              eq(classes.schoolId, schoolId),
            ),
          )
          .returning(),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Class not found");
    } catch {
      return internalError(context);
    }
  },
);

classRoutes.post(
  "/:id/migrate",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = migrateSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    const sourceClassId = context.req.param("id")!;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [sourceClass] = await tx
          .select()
          .from(classes)
          .where(
            and(eq(classes.id, sourceClassId), eq(classes.schoolId, schoolId)),
          );
        if (!sourceClass) return { kind: "missing" as const };

        const targetYear = await validateYear(
          tx,
          schoolId,
          parsed.data.targetSchoolYearId,
        );
        if (!targetYear) return { kind: "invalid_year" as const };

        const className = parsed.data.newClassName ?? sourceClass.name;
        const [duplicate] = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(
            and(
              eq(classes.schoolId, schoolId),
              eq(classes.schoolYearId, targetYear.id),
              eq(classes.name, className),
            ),
          );
        if (duplicate) return { kind: "duplicate" as const };

        const [newClass] = await tx
          .insert(classes)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            schoolYearId: targetYear.id,
            name: className,
            teacherId: sourceClass.teacherId,
            maxStudents: sourceClass.maxStudents,
            status: "active",
          })
          .returning();
        if (!newClass) throw new Error("Class was not created");

        const activeEnrollments = await tx
          .select({ studentId: classStudents.studentId })
          .from(classStudents)
          .where(
            and(
              eq(classStudents.schoolId, schoolId),
              eq(classStudents.classId, sourceClass.id),
              isNull(classStudents.leftAt),
            ),
          );
        const studentIds = activeEnrollments.map((row) => row.studentId);
        const now = new Date();
        if (studentIds.length) {
          await tx
            .update(classStudents)
            .set({ leftAt: now })
            .where(
              and(
                eq(classStudents.schoolId, schoolId),
                eq(classStudents.classId, sourceClass.id),
                isNull(classStudents.leftAt),
                inArray(classStudents.studentId, studentIds),
              ),
            );
          await tx
            .update(classHistory)
            .set({ leftAt: now })
            .where(
              and(
                eq(classHistory.schoolId, schoolId),
                eq(classHistory.classId, sourceClass.id),
                eq(classHistory.schoolYearId, sourceClass.schoolYearId),
                isNull(classHistory.leftAt),
                inArray(classHistory.studentId, studentIds),
              ),
            );
          await tx.insert(classStudents).values(
            studentIds.map((studentId) => ({
              id: crypto.randomUUID(),
              schoolId,
              classId: newClass.id,
              studentId,
              schoolYearId: targetYear.id,
              enrolledAt: now,
            })),
          );
          await tx.insert(classHistory).values(
            studentIds.map((studentId) => ({
              id: crypto.randomUUID(),
              schoolId,
              studentId,
              classId: newClass.id,
              schoolYearId: targetYear.id,
              enrolledAt: now,
            })),
          );
          await tx
            .update(students)
            .set({ currentClassId: newClass.id })
            .where(
              and(
                eq(students.schoolId, schoolId),
                inArray(students.id, studentIds),
              ),
            );
        }
        return {
          kind: "migrated" as const,
          data: { newClass, migratedStudentCount: studentIds.length },
        };
      });
      if (result.kind === "missing")
        return notFoundError(context, "Class not found");
      if (result.kind === "invalid_year")
        return validationError(
          context,
          "Target school year is missing or archived",
        );
      if (result.kind === "duplicate")
        return validationError(
          context,
          "Class name already exists in target school year",
        );
      return context.json({ success: true, data: result.data, error: null });
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(
            context,
            "Class name already exists in target school year",
          )
        : internalError(context);
    }
  },
);
