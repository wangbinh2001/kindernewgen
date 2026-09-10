import { and, asc, desc, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  attendance,
  classes,
  foodItems,
  healthRecords,
  menus,
  parentChildren,
  parentRequestAttachments,
  parentRequestHistory,
  parentRequests,
  responsiblePersons,
  studentBalances,
  students,
  timelineMedia,
  timelinePosts,
  timelineTags,
  tuitionHistory,
  tuitionItems,
  users,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import { internalError, notFoundError, validationError } from "../http/errors";

const requestType = z.enum([
  "absence",
  "late_arrival",
  "late_pickup",
  "medical",
  "health_notice",
  "other",
]);
const attachmentSchema = z
  .object({
    fileUrl: z.string().trim().min(1),
    fileType: z.enum(["image", "pdf", "document"]),
    fileName: z.string().trim().min(1),
  })
  .strict();
const createSchema = z
  .object({
    childId: z.string().min(1),
    type: requestType,
    content: z.string().trim().min(1),
    urgent: z.boolean().default(false),
    attachments: z.array(attachmentSchema).default([]),
  })
  .strict();

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

export const parentRoutes = new Hono();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  })
  .strict();

async function ownedChild(
  tx: TenantTransaction,
  schoolId: string,
  parentId: string,
  childId: string,
) {
  const [child] = await tx
    .select({
      id: students.id,
      schoolId: students.schoolId,
      fullName: students.fullName,
      status: students.status,
      dob: students.dob,
      gender: students.gender,
      cccd: students.cccd,
      cccdIssueDate: students.cccdIssueDate,
      cccdIssuePlace: students.cccdIssuePlace,
      address: students.address,
      currentClassId: students.currentClassId,
      className: classes.name,
    })
    .from(parentChildren)
    .innerJoin(students, eq(students.id, parentChildren.childId))
    .leftJoin(
      classes,
      and(
        eq(classes.id, students.currentClassId),
        eq(classes.schoolId, schoolId),
      ),
    )
    .where(
      and(
        eq(parentChildren.parentId, parentId),
        eq(parentChildren.childId, childId),
        eq(students.id, childId),
        eq(students.schoolId, schoolId),
      ),
    );
  return child;
}

function profileOf(child: NonNullable<Awaited<ReturnType<typeof ownedChild>>>) {
  return {
    id: child.id,
    schoolId: child.schoolId,
    fullName: child.fullName,
    status: child.status,
    dob: child.dob,
    gender: child.gender,
    cccd: child.cccd,
    cccdIssueDate: child.cccdIssueDate,
    cccdIssuePlace: child.cccdIssuePlace,
    address: child.address,
    currentClass: child.currentClassId ? { name: child.className } : null,
  };
}

function dateRange(context: Context) {
  const month = context.req.query("month");
  if (month) {
    const parsed = monthSchema.safeParse(month);
    if (!parsed.success) return null;
    const [year, monthNumber] = parsed.data.split("-").map(Number);
    const end = new Date(Date.UTC(year!, monthNumber!, 1))
      .toISOString()
      .slice(0, 10);
    return { start: `${parsed.data}-01`, end };
  }
  const startDate = context.req.query("startDate");
  const endDate = context.req.query("endDate");
  const start = dateSchema.safeParse(startDate);
  const end = dateSchema.safeParse(endDate);
  if (!start.success || !end.success || start.data > end.data) return null;
  const endExclusive = new Date(`${end.data}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start: start.data, end: endExclusive.toISOString().slice(0, 10) };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

parentRoutes.post("/", requireAuth, requireRole("parent"), async (context) => {
  const parsed = createSchema.safeParse(await readJson(context));
  if (!parsed.success)
    return validationError(context, "Invalid parent request");
  const claims = claimsOf(context);
  const schoolId = claims.school_id;
  try {
    const result = await withTenant(schoolId, async (tx) => {
      const [child] = await tx
        .select({ id: students.id })
        .from(parentChildren)
        .innerJoin(students, eq(students.id, parentChildren.childId))
        .where(
          and(
            eq(parentChildren.parentId, claims.sub),
            eq(parentChildren.childId, parsed.data.childId),
            eq(students.schoolId, schoolId),
          ),
        );
      if (!child) return { kind: "not_found" as const };
      const [request] = await tx
        .insert(parentRequests)
        .values({
          id: crypto.randomUUID(),
          schoolId,
          parentId: claims.sub,
          childId: child.id,
          type: parsed.data.type,
          content: parsed.data.content,
          urgent: parsed.data.urgent,
          status: "pending",
        })
        .returning();
      if (!request) throw new Error("Parent request was not created");
      if (parsed.data.attachments.length) {
        await tx.insert(parentRequestAttachments).values(
          parsed.data.attachments.map((attachment) => ({
            id: crypto.randomUUID(),
            schoolId,
            requestId: request.id,
            fileUrl: attachment.fileUrl,
            fileType: attachment.fileType,
            fileName: attachment.fileName,
          })),
        );
      }
      await tx.insert(parentRequestHistory).values({
        id: crypto.randomUUID(),
        schoolId,
        requestId: request.id,
        status: "pending",
        changedBy: claims.sub,
        note: "Created by parent",
      });
      return { kind: "created" as const, request };
    });
    if (result.kind === "not_found") {
      return notFoundError(context, "Child is not linked to this parent");
    }
    return context.json(
      { success: true, data: result.request, error: null },
      201,
    );
  } catch {
    return internalError(context);
  }
});

parentRoutes.get("/", requireAuth, requireRole("parent"), async (context) => {
  const claims = claimsOf(context);
  try {
    const data = await withTenant(claims.school_id, (tx) =>
      tx
        .select({
          id: parentRequests.id,
          childId: parentRequests.childId,
          childName: students.fullName,
          type: parentRequests.type,
          content: parentRequests.content,
          urgent: parentRequests.urgent,
          status: parentRequests.status,
          response: parentRequests.response,
          createdAt: parentRequests.createdAt,
          updatedAt: parentRequests.updatedAt,
        })
        .from(parentRequests)
        .innerJoin(students, eq(students.id, parentRequests.childId))
        .where(
          and(
            eq(parentRequests.schoolId, claims.school_id),
            eq(parentRequests.parentId, claims.sub),
          ),
        )
        .orderBy(desc(parentRequests.createdAt), desc(parentRequests.id)),
    );
    return context.json({ success: true, data, error: null });
  } catch {
    return internalError(context);
  }
});

parentRoutes.delete(
  "/:id",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const result = await withTenant(claims.school_id, async (tx) => {
        const [request] = await tx
          .select()
          .from(parentRequests)
          .where(
            and(
              eq(parentRequests.id, context.req.param("id")!),
              eq(parentRequests.schoolId, claims.school_id),
              eq(parentRequests.parentId, claims.sub),
            ),
          );
        if (!request) return "missing" as const;
        if (request.status !== "pending") return "not_pending" as const;
        await tx
          .delete(parentRequestAttachments)
          .where(eq(parentRequestAttachments.requestId, request.id));
        await tx
          .delete(parentRequestHistory)
          .where(eq(parentRequestHistory.requestId, request.id));
        await tx
          .delete(parentRequests)
          .where(eq(parentRequests.id, request.id));
        return "deleted" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Parent request not found");
      if (result === "not_pending")
        return validationError(
          context,
          "Only pending requests can be cancelled",
        );
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);

export const parentPortalRoutes = new Hono();

parentPortalRoutes.get(
  "/children",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const rows = await tx
          .select({
            id: students.id,
            schoolId: students.schoolId,
            fullName: students.fullName,
            status: students.status,
            dob: students.dob,
            gender: students.gender,
            currentClassId: students.currentClassId,
            className: classes.name,
          })
          .from(parentChildren)
          .innerJoin(students, eq(students.id, parentChildren.childId))
          .leftJoin(
            classes,
            and(
              eq(classes.id, students.currentClassId),
              eq(classes.schoolId, claims.school_id),
            ),
          )
          .where(
            and(
              eq(parentChildren.parentId, claims.sub),
              eq(students.schoolId, claims.school_id),
            ),
          )
          .orderBy(asc(students.fullName), asc(students.id));
        return rows.map((child) => ({
          id: child.id,
          schoolId: child.schoolId,
          fullName: child.fullName,
          status: child.status,
          dob: child.dob,
          gender: child.gender,
          currentClass: child.currentClassId ? { name: child.className } : null,
        }));
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.get(
  "/children/:id",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const child = await ownedChild(
          tx,
          claims.school_id,
          claims.sub,
          context.req.param("id")!,
        );
        if (!child) return null;
        const responsible = await tx
          .select({
            id: responsiblePersons.id,
            type: responsiblePersons.type,
            fullName: responsiblePersons.fullName,
            yearOfBirth: responsiblePersons.yearOfBirth,
            cccd: responsiblePersons.cccd,
            phone: responsiblePersons.phone,
          })
          .from(responsiblePersons)
          .where(eq(responsiblePersons.studentId, child.id))
          .orderBy(asc(responsiblePersons.type), asc(responsiblePersons.id));
        return { ...profileOf(child), responsiblePersons: responsible };
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Child not found");
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.get(
  "/children/:id/attendance",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const range = dateRange(context);
    if (!range)
      return validationError(context, "Invalid attendance date range");
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const child = await ownedChild(
          tx,
          claims.school_id,
          claims.sub,
          context.req.param("id")!,
        );
        if (!child) return null;
        const rows = await tx
          .select({
            id: attendance.id,
            studentId: attendance.studentId,
            date: attendance.date,
            classId: attendance.classId,
            status: attendance.status,
            note: attendance.note,
            checkInTime: attendance.checkInTime,
            checkOutTime: attendance.checkOutTime,
            overtimeStart: attendance.overtimeStart,
            overtimeEnd: attendance.overtimeEnd,
            overtimeHours: attendance.overtimeHours,
            state: attendance.state,
          })
          .from(attendance)
          .where(
            and(
              eq(attendance.schoolId, claims.school_id),
              eq(attendance.studentId, child.id),
              gte(attendance.date, range.start),
              lt(attendance.date, range.end),
              eq(attendance.state, "confirmed"),
            ),
          )
          .orderBy(desc(attendance.date), desc(attendance.createdAt));
        return rows;
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Child not found");
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.get(
  "/children/:id/tuition",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const child = await ownedChild(
          tx,
          claims.school_id,
          claims.sub,
          context.req.param("id")!,
        );
        if (!child) return null;
        const history = await tx
          .select({
            id: tuitionHistory.id,
            month: tuitionHistory.month,
            feeSnapshot: tuitionHistory.feeSnapshot,
            reductionType: tuitionHistory.reductionType,
            reductionValue: tuitionHistory.reductionValue,
            totalFees: tuitionHistory.totalFees,
            totalReduction: tuitionHistory.totalReduction,
            finalAmount: tuitionHistory.finalAmount,
            note: tuitionHistory.note,
            state: tuitionHistory.state,
            confirmedAt: tuitionHistory.confirmedAt,
            createdAt: tuitionHistory.createdAt,
          })
          .from(tuitionHistory)
          .where(
            and(
              eq(tuitionHistory.schoolId, claims.school_id),
              eq(tuitionHistory.studentId, child.id),
              eq(tuitionHistory.state, "confirmed"),
            ),
          )
          .orderBy(desc(tuitionHistory.month), desc(tuitionHistory.createdAt));
        const historyIds = history.map((item) => item.id);
        const items = historyIds.length
          ? await tx
              .select({
                id: tuitionItems.id,
                tuitionHistoryId: tuitionItems.tuitionHistoryId,
                feeType: tuitionItems.feeType,
                description: tuitionItems.description,
                amount: tuitionItems.amount,
              })
              .from(tuitionItems)
              .where(inArray(tuitionItems.tuitionHistoryId, historyIds))
          : [];
        const balances = await tx
          .select({
            id: studentBalances.id,
            period: studentBalances.period,
            openingAmount: studentBalances.openingAmount,
            charges: studentBalances.charges,
            payments: studentBalances.payments,
            adjustments: studentBalances.adjustments,
            closingAmount: studentBalances.closingAmount,
            createdAt: studentBalances.createdAt,
          })
          .from(studentBalances)
          .where(
            and(
              eq(studentBalances.schoolId, claims.school_id),
              eq(studentBalances.studentId, child.id),
            ),
          )
          .orderBy(desc(studentBalances.period));
        return {
          history: history.map((item) => ({
            ...item,
            items: items.filter(
              (detail) => detail.tuitionHistoryId === item.id,
            ),
          })),
          balances,
          currentBalance: balances[0] ?? null,
        };
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Child not found");
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.get(
  "/children/:id/health",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const child = await ownedChild(
          tx,
          claims.school_id,
          claims.sub,
          context.req.param("id")!,
        );
        if (!child) return null;
        const rows = await tx
          .select({
            id: healthRecords.id,
            date: healthRecords.date,
            height: healthRecords.height,
            weight: healthRecords.weight,
            bmi: healthRecords.bmi,
            ageMonths: healthRecords.ageMonths,
            classification: healthRecords.classification,
            note: healthRecords.note,
            createdAt: healthRecords.createdAt,
          })
          .from(healthRecords)
          .where(
            and(
              eq(healthRecords.schoolId, claims.school_id),
              eq(healthRecords.studentId, child.id),
              eq(healthRecords.state, "active"),
            ),
          )
          .orderBy(desc(healthRecords.date), desc(healthRecords.createdAt));
        return rows.map((row) => ({
          ...row,
          height: Number(row.height),
          weight: Number(row.weight),
          bmi: Number(row.bmi),
        }));
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Child not found");
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.get(
  "/children/:id/timeline",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, async (tx) => {
        const child = await ownedChild(
          tx,
          claims.school_id,
          claims.sub,
          context.req.param("id")!,
        );
        if (!child) return null;
        const tagged = await tx
          .select({ postId: timelineTags.postId })
          .from(timelineTags)
          .where(
            and(
              eq(timelineTags.schoolId, claims.school_id),
              eq(timelineTags.studentId, child.id),
            ),
          );
        const postCondition = tagged.length
          ? or(
              eq(timelinePosts.studentId, child.id),
              inArray(
                timelinePosts.id,
                tagged.map((item) => item.postId),
              ),
            )
          : eq(timelinePosts.studentId, child.id);
        const posts = await tx
          .select({
            id: timelinePosts.id,
            type: timelinePosts.type,
            classId: timelinePosts.classId,
            studentId: timelinePosts.studentId,
            content: timelinePosts.content,
            note: timelinePosts.note,
            createdAt: timelinePosts.createdAt,
            updatedAt: timelinePosts.updatedAt,
          })
          .from(timelinePosts)
          .where(
            and(
              eq(timelinePosts.schoolId, claims.school_id),
              eq(timelinePosts.status, "active"),
              postCondition,
            ),
          )
          .orderBy(desc(timelinePosts.createdAt), desc(timelinePosts.id));
        const postIds = posts.map((post) => post.id);
        const media = postIds.length
          ? await tx
              .select({
                id: timelineMedia.id,
                postId: timelineMedia.postId,
                fileUrl: timelineMedia.fileUrl,
                fileType: timelineMedia.fileType,
                fileName: timelineMedia.fileName,
                fileSize: timelineMedia.fileSize,
                createdAt: timelineMedia.createdAt,
              })
              .from(timelineMedia)
              .where(
                and(
                  eq(timelineMedia.schoolId, claims.school_id),
                  inArray(timelineMedia.postId, postIds),
                ),
              )
          : [];
        const tags = postIds.length
          ? await tx
              .select({
                id: timelineTags.id,
                postId: timelineTags.postId,
                studentId: timelineTags.studentId,
              })
              .from(timelineTags)
              .where(
                and(
                  eq(timelineTags.schoolId, claims.school_id),
                  inArray(timelineTags.postId, postIds),
                ),
              )
          : [];
        return posts.map((post) => ({
          ...post,
          media: media.filter((item) => item.postId === post.id),
          tags: tags.filter((item) => item.postId === post.id),
        }));
      });
      return data
        ? context.json({ success: true, data, error: null })
        : notFoundError(context, "Child not found");
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.get(
  "/menu",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const requestedDate = context.req.query("date") ?? today();
    const parsedDate = dateSchema.safeParse(requestedDate);
    if (!parsedDate.success)
      return validationError(context, "Invalid menu date");
    const claims = claimsOf(context);
    try {
      const data = await withTenant(claims.school_id, (tx) =>
        tx
          .select({
            id: menus.id,
            date: menus.date,
            mealType: menus.mealType,
            foodItemId: menus.foodItemId,
            foodName: foodItems.name,
            description: foodItems.description,
          })
          .from(menus)
          .innerJoin(foodItems, eq(foodItems.id, menus.foodItemId))
          .where(
            and(
              eq(menus.schoolId, claims.school_id),
              eq(menus.date, parsedDate.data),
            ),
          )
          .orderBy(asc(menus.mealType), asc(menus.id)),
      );
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

parentPortalRoutes.post(
  "/change-password",
  requireAuth,
  requireRole("parent"),
  async (context) => {
    const parsed = changePasswordSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid password change");
    const claims = claimsOf(context);
    try {
      const result = await withTenant(claims.school_id, async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, claims.sub));
        if (!user || user.status !== "active") return "missing" as const;
        if (
          !(await Bun.password.verify(
            parsed.data.currentPassword,
            user.passwordHash,
          ))
        ) {
          return "invalid" as const;
        }
        if (parsed.data.currentPassword === parsed.data.newPassword) {
          return "same" as const;
        }
        const passwordHash = await Bun.password.hash(parsed.data.newPassword, {
          algorithm: "argon2id",
        });
        await tx
          .update(users)
          .set({
            passwordHash,
            mustChangePassword: false,
            sessionVersion: user.sessionVersion + 1,
          })
          .where(eq(users.id, user.id));
        return "changed" as const;
      });
      if (result === "missing")
        return notFoundError(context, "Parent not found");
      if (result === "invalid") {
        return context.json(
          {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "Invalid password" },
          },
          401,
        );
      }
      if (result === "same") {
        return validationError(context, "New password must be different");
      }
      return context.json({ success: true, data: null, error: null });
    } catch {
      return internalError(context);
    }
  },
);
