import { and, asc, count, eq, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { registerParent } from "../auth/register";
import {
  classHistory,
  classStudents,
  classes,
  parentChildren,
  responsiblePersons,
  students,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid date");
const genderSchema = z.enum(["male", "female", "other"]);
const responsiblePersonSchema = z
  .object({
    type: z.enum(["father", "mother", "guardian"]),
    fullName: z.string().trim().min(1),
    yearOfBirth: z.number().int().min(1900).max(new Date().getFullYear()),
    cccd: z.string().trim().min(1),
    phone: z.string().regex(/^0\d{9}$/),
  })
  .strict();

const createStudentBodySchema = z.object({
  full_name: z.string().trim().min(1),
  dob: dateSchema,
  gender: genderSchema,
  cccd: z.string().trim().min(1),
  cccd_issue_date: dateSchema.optional(),
  cccd_issue_place: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  responsiblePersons: z.array(responsiblePersonSchema).min(1),
  classId: z.string().min(1).optional(),
});

const listStudentsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
  })
  .strict();

const updateStudentBodySchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    status: z.enum(["active", "inactive", "deleted"]).optional(),
    dob: dateSchema.optional(),
    gender: genderSchema.optional(),
    cccd: z.string().trim().min(1).optional(),
    cccdIssueDate: dateSchema.optional(),
    cccdIssuePlace: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    responsiblePersons: z.array(responsiblePersonSchema).min(1).optional(),
    classId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function validationError(context: Context, message = "Invalid request") {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message },
    },
    400,
  );
}

function internalError(context: Context) {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    },
    500,
  );
}

function notFoundError(context: Context) {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Student not found" },
    },
    404,
  );
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function getActiveClass(
  tx: TenantTransaction,
  schoolId: string,
  classId: string,
) {
  const [classRow] = await tx
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.id, classId),
        eq(classes.schoolId, schoolId),
        eq(classes.status, "active"),
      ),
    );
  return classRow;
}

async function closeEnrollment(
  tx: TenantTransaction,
  studentId: string,
  classId: string,
) {
  const leftAt = new Date();
  await tx
    .update(classStudents)
    .set({ leftAt })
    .where(
      and(
        eq(classStudents.studentId, studentId),
        eq(classStudents.classId, classId),
        isNull(classStudents.leftAt),
      ),
    );
  await tx
    .update(classHistory)
    .set({ leftAt })
    .where(
      and(
        eq(classHistory.studentId, studentId),
        eq(classHistory.classId, classId),
        isNull(classHistory.leftAt),
      ),
    );
}

async function addEnrollment(
  tx: TenantTransaction,
  studentId: string,
  classRow: typeof classes.$inferSelect,
) {
  const enrolledAt = new Date();
  await tx.insert(classStudents).values({
    id: crypto.randomUUID(),
    schoolId: classRow.schoolId,
    classId: classRow.id,
    studentId,
    schoolYearId: classRow.schoolYearId,
    enrolledAt,
  });
  await tx.insert(classHistory).values({
    id: crypto.randomUUID(),
    schoolId: classRow.schoolId,
    studentId,
    classId: classRow.id,
    schoolYearId: classRow.schoolYearId,
    enrolledAt,
  });
}

export const studentRoutes = new Hono();

studentRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsedBody = createStudentBodySchema.safeParse(
      await readJson(context),
    );
    if (!parsedBody.success) {
      return validationError(context);
    }

    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [duplicate] = await tx
          .select({ id: students.id })
          .from(students)
          .where(eq(students.cccd, parsedBody.data.cccd));
        if (duplicate) {
          return { kind: "duplicate" as const };
        }

        const classRow = parsedBody.data.classId
          ? await getActiveClass(tx, schoolId, parsedBody.data.classId)
          : undefined;
        if (parsedBody.data.classId && !classRow) {
          return { kind: "invalid_class" as const };
        }

        const [student] = await tx
          .insert(students)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            fullName: parsedBody.data.full_name,
            dob: parsedBody.data.dob,
            gender: parsedBody.data.gender,
            cccd: parsedBody.data.cccd,
            cccdIssueDate: parsedBody.data.cccd_issue_date,
            cccdIssuePlace: parsedBody.data.cccd_issue_place,
            address: parsedBody.data.address,
            currentClassId: parsedBody.data.classId,
          })
          .returning();
        if (!student) {
          throw new Error("Failed to create student");
        }

        if (classRow) {
          await addEnrollment(tx, student.id, classRow);
        }

        const persons = await tx
          .insert(responsiblePersons)
          .values(
            parsedBody.data.responsiblePersons.map((person) => ({
              id: crypto.randomUUID(),
              studentId: student.id,
              type: person.type,
              fullName: person.fullName,
              yearOfBirth: person.yearOfBirth,
              cccd: person.cccd,
              phone: person.phone,
            })),
          )
          .returning();

        const linkedPhones = new Set<string>();
        for (const person of parsedBody.data.responsiblePersons) {
          if (linkedPhones.has(person.phone)) {
            continue;
          }
          linkedPhones.add(person.phone);
          const parent = await registerParent(
            {
              phone: person.phone,
              schoolId,
              displayName: person.fullName,
            },
            tx,
          );
          await tx.insert(parentChildren).values({
            id: crypto.randomUUID(),
            parentId: parent.user.id,
            childId: student.id,
          });
        }

        return {
          kind: "created" as const,
          student: { ...student, responsiblePersons: persons },
        };
      });

      if (result.kind === "duplicate") {
        return validationError(context, "CCCD already exists in this school");
      }
      if (result.kind === "invalid_class") {
        return validationError(context, "Class is missing or inactive");
      }

      return context.json(
        { success: true, data: result.student, error: null },
        201,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return validationError(context, "CCCD already exists in this school");
      }
      return internalError(context);
    }
  },
);

studentRoutes.get(
  "/",
  requireAuth,
  requireRole("school_admin", "staff"),
  async (context) => {
    const parsedQuery = listStudentsQuerySchema.safeParse(context.req.query());
    if (!parsedQuery.success) {
      return validationError(
        context,
        "Invalid pagination or search parameters",
      );
    }

    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    const { page, limit, search } = parsedQuery.data;
    const offset = (page - 1) * limit;

    try {
      const result = await withTenant(schoolId, async (tx) => {
        const filters = [eq(students.schoolId, schoolId)];
        if (search) {
          filters.push(ilike(students.fullName, `%${search}%`));
        }
        const where = and(...filters);
        const items = await tx
          .select()
          .from(students)
          .where(where)
          .orderBy(asc(students.createdAt), asc(students.id))
          .limit(limit)
          .offset(offset);
        const [totalRow] = await tx
          .select({ total: count() })
          .from(students)
          .where(where);

        return { items, total: Number(totalRow?.total ?? 0) };
      });

      return context.json({
        success: true,
        data: { ...result, page, limit },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

studentRoutes.get(
  "/:id",
  requireAuth,
  requireRole("school_admin", "staff"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    const studentId = context.req.param("id")!;

    try {
      const profile = await withTenant(schoolId, async (tx) => {
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, studentId));
        if (!student) {
          return null;
        }
        const persons = await tx
          .select()
          .from(responsiblePersons)
          .where(eq(responsiblePersons.studentId, studentId));
        return { ...student, responsiblePersons: persons };
      });

      if (!profile) {
        return notFoundError(context);
      }
      return context.json({ success: true, data: profile, error: null });
    } catch {
      return internalError(context);
    }
  },
);

studentRoutes.put(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsedBody = updateStudentBodySchema.safeParse(
      await readJson(context),
    );
    if (!parsedBody.success) {
      return validationError(context, "Invalid student profile");
    }

    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    const studentId = context.req.param("id")!;

    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [existing] = await tx
          .select()
          .from(students)
          .where(eq(students.id, studentId));
        if (!existing) {
          return { kind: "not_found" as const };
        }
        if (
          existing.cccd &&
          parsedBody.data.cccd !== undefined &&
          parsedBody.data.cccd !== existing.cccd
        ) {
          return { kind: "cccd_locked" as const };
        }

        const requestedClassId = parsedBody.data.classId;
        const classRow =
          requestedClassId && requestedClassId !== existing.currentClassId
            ? await getActiveClass(tx, schoolId, requestedClassId)
            : undefined;
        if (requestedClassId && !classRow) {
          return { kind: "invalid_class" as const };
        }
        if (
          requestedClassId !== undefined &&
          requestedClassId !== existing.currentClassId &&
          existing.currentClassId
        ) {
          await closeEnrollment(tx, studentId, existing.currentClassId);
        }
        if (classRow) {
          await addEnrollment(tx, studentId, classRow);
        }

        const {
          responsiblePersons: persons,
          classId: _classId,
          ...studentChanges
        } = parsedBody.data;
        const changes = {
          ...studentChanges,
          ...(requestedClassId !== undefined
            ? { currentClassId: requestedClassId }
            : {}),
        };
        let updated = existing;
        if (Object.keys(changes).length > 0) {
          const [changed] = await tx
            .update(students)
            .set(changes)
            .where(eq(students.id, studentId))
            .returning();
          if (!changed) {
            return { kind: "not_found" as const };
          }
          updated = changed;
        }

        if (persons) {
          await tx
            .delete(responsiblePersons)
            .where(eq(responsiblePersons.studentId, studentId));
          await tx.insert(responsiblePersons).values(
            persons.map((person) => ({
              id: crypto.randomUUID(),
              studentId,
              type: person.type,
              fullName: person.fullName,
              yearOfBirth: person.yearOfBirth,
              cccd: person.cccd,
              phone: person.phone,
            })),
          );
        }

        const savedPersons = await tx
          .select()
          .from(responsiblePersons)
          .where(eq(responsiblePersons.studentId, studentId));
        return {
          kind: "updated" as const,
          student: { ...updated, responsiblePersons: savedPersons },
        };
      });

      if (result.kind === "not_found") {
        return notFoundError(context);
      }
      if (result.kind === "cccd_locked") {
        return validationError(context, "CCCD cannot be changed once set");
      }
      if (result.kind === "invalid_class") {
        return validationError(context, "Class is missing or inactive");
      }
      return context.json({ success: true, data: result.student, error: null });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return validationError(context, "CCCD already exists in this school");
      }
      return internalError(context);
    }
  },
);

const transferClassSchema = z
  .object({ newClassId: z.string().min(1) })
  .strict();

studentRoutes.post(
  "/:id/transfer-class",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = transferClassSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context);
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    const studentId = context.req.param("id")!;

    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, studentId));
        if (!student) return { kind: "not_found" as const };
        if (student.currentClassId === parsed.data.newClassId) {
          return { kind: "same_class" as const };
        }
        const classRow = await getActiveClass(
          tx,
          schoolId,
          parsed.data.newClassId,
        );
        if (!classRow) return { kind: "invalid_class" as const };
        if (student.currentClassId) {
          await closeEnrollment(tx, studentId, student.currentClassId);
        }
        await addEnrollment(tx, studentId, classRow);
        const [updated] = await tx
          .update(students)
          .set({ currentClassId: classRow.id })
          .where(eq(students.id, studentId))
          .returning();
        return { kind: "transferred" as const, student: updated };
      });

      if (result.kind === "not_found") return notFoundError(context);
      if (result.kind === "same_class") {
        return validationError(context, "Student is already in this class");
      }
      if (result.kind === "invalid_class") {
        return validationError(context, "Class is missing or inactive");
      }
      return context.json({ success: true, data: result.student, error: null });
    } catch {
      return internalError(context);
    }
  },
);

studentRoutes.delete(
  "/:id",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const schoolId = (context.get("auth").claims as TenantAccessTokenClaims)
      .school_id;
    const studentId = context.req.param("id")!;

    try {
      const [student] = await withTenant(schoolId, async (tx) =>
        tx
          .update(students)
          .set({ status: "deleted" })
          .where(eq(students.id, studentId))
          .returning(),
      );

      if (!student) {
        return notFoundError(context);
      }
      return context.json({ success: true, data: student, error: null });
    } catch {
      return internalError(context);
    }
  },
);
