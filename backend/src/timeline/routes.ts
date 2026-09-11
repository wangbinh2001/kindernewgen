import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  classStudents,
  classes,
  schoolMemberships,
  students,
  teacherAssignments,
  timelineEditHistory,
  timelineMedia,
  timelinePosts,
  timelineTags,
  users,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import {
  internalError,
  isUniqueViolation,
  notFoundError,
  validationError,
} from "../http/errors";
import { notifyParentsOfStudents } from "../notifications/service";

const typeSchema = z.enum(["class", "child"]);
const mediaSchema = z
  .object({
    fileUrl: z.string().trim().min(1),
    fileType: z.enum(["image", "video"]),
    fileName: z.string().trim().min(1),
    fileSize: z.number().int().nonnegative(),
  })
  .strict();
const createSchema = z
  .object({
    type: typeSchema,
    content: z.string().trim().min(1),
    note: z.string().trim().min(1).nullable().optional(),
    classId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).default([]),
    media: z.array(mediaSchema).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "class" && !value.classId) {
      ctx.addIssue({ code: "custom", message: "classId is required" });
    }
    if (value.type === "child" && !value.studentId) {
      ctx.addIssue({ code: "custom", message: "studentId is required" });
    }
    if (new Set(value.tags).size !== value.tags.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate student tag" });
    }
  });
const updateSchema = z.object({ content: z.string().trim().min(1) }).strict();

async function readJson(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

function schoolIdOf(context: Context) {
  return claimsOf(context).school_id;
}

function forbidden(context: Context, message = "Insufficient permissions") {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "FORBIDDEN", message },
    },
    403,
  );
}

async function readPost(
  tx: TenantTransaction,
  schoolId: string,
  postId: string,
) {
  const [post] = await tx
    .select({
      id: timelinePosts.id,
      schoolId: timelinePosts.schoolId,
      authorMembershipId: timelinePosts.authorMembershipId,
      type: timelinePosts.type,
      classId: timelinePosts.classId,
      studentId: timelinePosts.studentId,
      content: timelinePosts.content,
      note: timelinePosts.note,
      status: timelinePosts.status,
      createdAt: timelinePosts.createdAt,
      updatedAt: timelinePosts.updatedAt,
      authorId: users.id,
      authorName: users.displayName,
    })
    .from(timelinePosts)
    .innerJoin(
      schoolMemberships,
      eq(schoolMemberships.id, timelinePosts.authorMembershipId),
    )
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(
      and(
        eq(timelinePosts.id, postId),
        eq(timelinePosts.schoolId, schoolId),
        eq(timelinePosts.status, "active"),
      ),
    );
  if (!post) return null;
  const media = await tx
    .select()
    .from(timelineMedia)
    .where(
      and(
        eq(timelineMedia.schoolId, schoolId),
        eq(timelineMedia.postId, postId),
      ),
    )
    .orderBy(asc(timelineMedia.createdAt), asc(timelineMedia.id));
  const tags = await tx
    .select({
      id: timelineTags.id,
      studentId: timelineTags.studentId,
      studentName: students.fullName,
      createdAt: timelineTags.createdAt,
    })
    .from(timelineTags)
    .innerJoin(students, eq(students.id, timelineTags.studentId))
    .where(
      and(eq(timelineTags.schoolId, schoolId), eq(timelineTags.postId, postId)),
    )
    .orderBy(asc(students.fullName), asc(students.id));
  return {
    ...post,
    author: { id: post.authorId, displayName: post.authorName },
    media,
    tags,
  };
}

async function teacherCanAccessClass(
  tx: TenantTransaction,
  schoolId: string,
  teacherId: string,
  classId: string,
) {
  const [assignment] = await tx
    .select({ id: teacherAssignments.id })
    .from(teacherAssignments)
    .where(
      and(
        eq(teacherAssignments.schoolId, schoolId),
        eq(teacherAssignments.teacherId, teacherId),
        eq(teacherAssignments.classId, classId),
        eq(teacherAssignments.status, "active"),
      ),
    );
  return Boolean(assignment);
}

async function teacherCanAccessStudent(
  tx: TenantTransaction,
  schoolId: string,
  teacherId: string,
  studentId: string,
) {
  const [assignment] = await tx
    .select({ id: teacherAssignments.id })
    .from(classStudents)
    .innerJoin(
      teacherAssignments,
      and(
        eq(teacherAssignments.classId, classStudents.classId),
        eq(teacherAssignments.schoolId, schoolId),
      ),
    )
    .where(
      and(
        eq(classStudents.schoolId, schoolId),
        eq(classStudents.studentId, studentId),
        eq(teacherAssignments.teacherId, teacherId),
        eq(teacherAssignments.status, "active"),
      ),
    );
  return Boolean(assignment);
}

export const timelineRoutes = new Hono();
const roles = ["school_admin", "teacher"] as const;

timelineRoutes.post(
  "/",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = createSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid timeline post");
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [membership] = await tx
          .select({ id: schoolMemberships.id })
          .from(schoolMemberships)
          .where(
            and(
              eq(schoolMemberships.id, claims.membership_id),
              eq(schoolMemberships.userId, claims.sub),
              eq(schoolMemberships.schoolId, schoolId),
              eq(schoolMemberships.status, "active"),
            ),
          );
        if (!membership) return { kind: "not_found" as const };

        if (parsed.data.type === "class") {
          const [classRow] = await tx
            .select({ id: classes.id })
            .from(classes)
            .where(
              and(
                eq(classes.id, parsed.data.classId!),
                eq(classes.schoolId, schoolId),
              ),
            );
          if (!classRow) return { kind: "not_found" as const };
          if (
            claims.role === "teacher" &&
            !(await teacherCanAccessClass(
              tx,
              schoolId,
              claims.sub,
              classRow.id,
            ))
          ) {
            return { kind: "forbidden" as const };
          }
        } else {
          const [student] = await tx
            .select({ id: students.id })
            .from(students)
            .where(
              and(
                eq(students.id, parsed.data.studentId!),
                eq(students.schoolId, schoolId),
              ),
            );
          if (!student) return { kind: "not_found" as const };
          if (
            claims.role === "teacher" &&
            !(await teacherCanAccessStudent(
              tx,
              schoolId,
              claims.sub,
              student.id,
            ))
          ) {
            return { kind: "forbidden" as const };
          }
        }

        if (parsed.data.tags.length) {
          const tagRows = await tx
            .select({ id: students.id })
            .from(students)
            .where(
              and(
                eq(students.schoolId, schoolId),
                inArray(students.id, parsed.data.tags),
              ),
            );
          if (tagRows.length !== parsed.data.tags.length) {
            return { kind: "invalid_tags" as const };
          }
          if (parsed.data.type === "class") {
            const enrolledTags = await tx
              .select({ id: classStudents.studentId })
              .from(classStudents)
              .where(
                and(
                  eq(classStudents.schoolId, schoolId),
                  eq(classStudents.classId, parsed.data.classId!),
                  inArray(classStudents.studentId, parsed.data.tags),
                ),
              );
            if (enrolledTags.length !== parsed.data.tags.length) {
              return { kind: "invalid_tags" as const };
            }
          }
        }
        const [post] = await tx
          .insert(timelinePosts)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            authorMembershipId: membership.id,
            type: parsed.data.type,
            classId: parsed.data.classId,
            studentId: parsed.data.studentId,
            content: parsed.data.content,
            note: parsed.data.note,
            status: "active",
          })
          .returning();
        if (!post) throw new Error("Timeline post was not created");
        if (parsed.data.tags.length) {
          await tx.insert(timelineTags).values(
            parsed.data.tags.map((studentId) => ({
              id: crypto.randomUUID(),
              schoolId,
              postId: post.id,
              studentId,
            })),
          );
        }
        if (parsed.data.media.length) {
          await tx.insert(timelineMedia).values(
            parsed.data.media.map((media) => ({
              id: crypto.randomUUID(),
              schoolId,
              postId: post.id,
              fileUrl: media.fileUrl,
              fileType: media.fileType,
              fileName: media.fileName,
              fileSize: media.fileSize,
            })),
          );
        }
        const targetIds = new Set(parsed.data.tags);
        if (parsed.data.studentId) targetIds.add(parsed.data.studentId);
        if (parsed.data.classId) {
          const enrolled = await tx
            .select({ studentId: classStudents.studentId })
            .from(classStudents)
            .where(
              and(
                eq(classStudents.schoolId, schoolId),
                eq(classStudents.classId, parsed.data.classId),
                isNull(classStudents.leftAt),
              ),
            );
          for (const row of enrolled) targetIds.add(row.studentId);
        }
        await notifyParentsOfStudents(tx, schoolId, [...targetIds], {
          type: "timeline",
          title: "Hoạt động mới của bé",
          message: parsed.data.content,
          entityType: "timeline_post",
          entityId: post.id,
          data: { postType: parsed.data.type },
        });
        return { kind: "created" as const, postId: post.id };
      });
      if (result.kind === "forbidden") {
        return forbidden(context, "Timeline is not assigned to this teacher");
      }
      if (result.kind === "invalid_tags") {
        return validationError(
          context,
          "Tagged student not found in this school",
        );
      }
      if (result.kind === "not_found") {
        return notFoundError(context, "Timeline target not found");
      }
      const data = await withTenant(schoolId, (tx) =>
        readPost(tx, schoolId, result.postId),
      );
      return context.json({ success: true, data, error: null }, 201);
    } catch (error) {
      return isUniqueViolation(error)
        ? validationError(context, "Duplicate timeline tag")
        : internalError(context);
    }
  },
);

timelineRoutes.get(
  "/class/:classId",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const [classRow] = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(
            and(
              eq(classes.id, context.req.param("classId")!),
              eq(classes.schoolId, schoolId),
            ),
          );
        if (!classRow) return null;
        const claims = claimsOf(context);
        if (
          claims.role === "teacher" &&
          !(await teacherCanAccessClass(tx, schoolId, claims.sub, classRow.id))
        ) {
          return "forbidden" as const;
        }
        const posts = await tx
          .select({ id: timelinePosts.id })
          .from(timelinePosts)
          .where(
            and(
              eq(timelinePosts.schoolId, schoolId),
              eq(timelinePosts.classId, classRow.id),
              eq(timelinePosts.type, "class"),
              eq(timelinePosts.status, "active"),
            ),
          )
          .orderBy(desc(timelinePosts.createdAt), desc(timelinePosts.id));
        return Promise.all(
          posts.map((post) => readPost(tx, schoolId, post.id)),
        ).then((rows) =>
          rows.filter((row): row is NonNullable<typeof row> => Boolean(row)),
        );
      });
      if (data === "forbidden") return forbidden(context);
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Class not found");
    } catch {
      return internalError(context);
    }
  },
);

timelineRoutes.get(
  "/student/:studentId",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const studentId = context.req.param("studentId")!;
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(
            and(eq(students.id, studentId), eq(students.schoolId, schoolId)),
          );
        if (!student) return null;
        const claims = claimsOf(context);
        if (
          claims.role === "teacher" &&
          !(await teacherCanAccessStudent(tx, schoolId, claims.sub, studentId))
        ) {
          return "forbidden" as const;
        }
        const tagged = await tx
          .select({ postId: timelineTags.postId })
          .from(timelineTags)
          .where(
            and(
              eq(timelineTags.schoolId, schoolId),
              eq(timelineTags.studentId, studentId),
            ),
          );
        const conditions = [eq(timelinePosts.studentId, studentId)];
        if (tagged.length) {
          conditions.push(
            inArray(
              timelinePosts.id,
              tagged.map((row) => row.postId),
            ),
          );
        }
        const posts = await tx
          .select({ id: timelinePosts.id })
          .from(timelinePosts)
          .where(
            and(
              eq(timelinePosts.schoolId, schoolId),
              eq(timelinePosts.status, "active"),
              or(...conditions),
            ),
          )
          .orderBy(desc(timelinePosts.createdAt), desc(timelinePosts.id));
        return Promise.all(
          posts.map((post) => readPost(tx, schoolId, post.id)),
        ).then((rows) =>
          rows.filter((row): row is NonNullable<typeof row> => Boolean(row)),
        );
      });
      if (data === "forbidden") return forbidden(context);
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Student not found");
    } catch {
      return internalError(context);
    }
  },
);

timelineRoutes.get(
  "/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, (tx) =>
        readPost(tx, schoolId, context.req.param("id")!),
      );
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Timeline post not found");
    } catch {
      return internalError(context);
    }
  },
);

timelineRoutes.put(
  "/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const parsed = updateSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid timeline post");
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [post] = await tx
          .select()
          .from(timelinePosts)
          .where(
            and(
              eq(timelinePosts.id, context.req.param("id")!),
              eq(timelinePosts.schoolId, schoolId),
              eq(timelinePosts.status, "active"),
            ),
          );
        if (!post) return { kind: "not_found" as const };
        if (
          claims.role !== "school_admin" &&
          post.authorMembershipId !== claims.membership_id
        ) {
          return { kind: "forbidden" as const };
        }
        await tx.insert(timelineEditHistory).values({
          id: crypto.randomUUID(),
          schoolId,
          postId: post.id,
          editorId: claims.sub,
          oldContent: post.content,
          newContent: parsed.data.content,
        });
        await tx
          .update(timelinePosts)
          .set({ content: parsed.data.content, updatedAt: new Date() })
          .where(eq(timelinePosts.id, post.id));
        return { kind: "updated" as const };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Timeline post not found");
      if (result.kind === "forbidden") return forbidden(context);
      const data = await withTenant(schoolId, (tx) =>
        readPost(tx, schoolId, context.req.param("id")!),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

timelineRoutes.delete(
  "/:id",
  requireAuth,
  requireRole(...roles),
  async (context) => {
    const claims = claimsOf(context);
    const schoolId = claims.school_id;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [post] = await tx
          .select()
          .from(timelinePosts)
          .where(
            and(
              eq(timelinePosts.id, context.req.param("id")!),
              eq(timelinePosts.schoolId, schoolId),
              eq(timelinePosts.status, "active"),
            ),
          );
        if (!post) return "missing" as const;
        if (
          claims.role !== "school_admin" &&
          post.authorMembershipId !== claims.membership_id
        ) {
          return "forbidden" as const;
        }
        await tx
          .update(timelinePosts)
          .set({ status: "deleted", updatedAt: new Date() })
          .where(eq(timelinePosts.id, post.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Timeline post not found");
      if (result === "forbidden") return forbidden(context);
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);
