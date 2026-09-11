import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { payments, studentBalances, students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { getClientIp, recordAuditLog } from "../db/audit";
import { internalError, notFoundError, validationError } from "../http/errors";

const paymentSchema = z
  .object({
    studentId: z.string().min(1),
    amount: z.number().int(),
    method: z.enum(["cash", "transfer", "other"]),
    period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

async function readJson(context: Context) {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

function schoolIdOf(context: Context) {
  return (context.get("auth").claims as TenantAccessTokenClaims).school_id;
}

export const paymentRoutes = new Hono();

paymentRoutes.get(
  "/",
  requireAuth,
  requireRole("school_admin", "staff"),
  async (context) => {
    const studentId = context.req.query("studentId");
    const period = context.req.query("period");
    if (!studentId) return validationError(context, "studentId is required");
    const schoolId = schoolIdOf(context);
    try {
      const data = await withTenant(schoolId, async (tx) => {
        const conditions = [
          eq(payments.schoolId, schoolId),
          eq(payments.studentId, studentId),
        ];
        const items = await tx
          .select()
          .from(payments)
          .where(and(...conditions))
          .orderBy(desc(payments.receivedAt), desc(payments.createdAt));
        const balances = await tx
          .select()
          .from(studentBalances)
          .where(
            period
              ? and(
                  eq(studentBalances.schoolId, schoolId),
                  eq(studentBalances.studentId, studentId),
                  eq(studentBalances.period, period),
                )
              : and(
                  eq(studentBalances.schoolId, schoolId),
                  eq(studentBalances.studentId, studentId),
                ),
          )
          .orderBy(desc(studentBalances.period));
        return { items, balances };
      });
      return context.json({ success: true, data, error: null });
    } catch {
      return internalError(context);
    }
  },
);

paymentRoutes.get(
  "/:id/receipt",
  requireAuth,
  requireRole("school_admin", "staff"),
  async (context) => {
    const schoolId = schoolIdOf(context);
    try {
      const receipt = await withTenant(schoolId, async (tx) => {
        const [row] = await tx
          .select({
            payment: payments,
            student: { id: students.id, fullName: students.fullName },
          })
          .from(payments)
          .innerJoin(students, eq(students.id, payments.studentId))
          .where(
            and(
              eq(payments.id, context.req.param("id")!),
              eq(payments.schoolId, schoolId),
            ),
          );
        return row ?? null;
      });
      if (!receipt) return notFoundError(context, "Payment not found");
      return context.json({
        success: true,
        data: {
          receiptNumber: receipt.payment.id,
          payment: receipt.payment,
          student: receipt.student,
        },
        error: null,
      });
    } catch {
      return internalError(context);
    }
  },
);

paymentRoutes.post(
  "/",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = paymentSchema.safeParse(await readJson(context));
    if (!parsed.success) return validationError(context, "Invalid payment");
    const schoolId = schoolIdOf(context);
    const claims = context.get("auth").claims as TenantAccessTokenClaims;
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(
            and(
              eq(students.id, parsed.data.studentId),
              eq(students.schoolId, schoolId),
            ),
          );
        if (!student) return { kind: "not_found" as const };

        const [payment] = await tx
          .insert(payments)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            studentId: parsed.data.studentId,
            amount: parsed.data.amount,
            method: parsed.data.method,
            receivedBy: claims.membership_id,
          })
          .returning();

        await recordAuditLog(tx, {
          actorId: claims.sub,
          schoolId,
          action: "create_payment",
          targetType: "payments",
          targetId: payment!.id,
          after: payment,
          ipAddress: getClientIp(context),
        });

        let [balance] = await tx
          .select()
          .from(studentBalances)
          .where(
            and(
              eq(studentBalances.schoolId, schoolId),
              eq(studentBalances.studentId, parsed.data.studentId),
              eq(studentBalances.period, parsed.data.period),
            ),
          )
          .for("update");

        let createdBalance = false;
        if (!balance) {
          const [created] = await tx
            .insert(studentBalances)
            .values({
              id: crypto.randomUUID(),
              schoolId,
              studentId: parsed.data.studentId,
              period: parsed.data.period,
              openingAmount: 0,
              charges: 0,
              payments: parsed.data.amount,
              adjustments: 0,
              closingAmount: -parsed.data.amount,
            })
            .onConflictDoNothing()
            .returning();
          balance = created;
          createdBalance = Boolean(balance);
          if (!balance) {
            [balance] = await tx
              .select()
              .from(studentBalances)
              .where(
                and(
                  eq(studentBalances.schoolId, schoolId),
                  eq(studentBalances.studentId, parsed.data.studentId),
                  eq(studentBalances.period, parsed.data.period),
                ),
              )
              .for("update");
          }
        }

        if (!balance) throw new Error("Balance was not created");
        if (!createdBalance) {
          const paymentsTotal = balance.payments + parsed.data.amount;
          const [updated] = await tx
            .update(studentBalances)
            .set({
              payments: paymentsTotal,
              closingAmount:
                balance.openingAmount +
                balance.charges -
                paymentsTotal +
                balance.adjustments,
            })
            .where(eq(studentBalances.id, balance.id))
            .returning();
          balance = updated;
        }
        return { kind: "saved" as const, data: balance };
      });
      return result.kind === "not_found"
        ? notFoundError(context, "Student not found")
        : context.json({ success: true, data: result.data, error: null }, 201);
    } catch {
      return internalError(context);
    }
  },
);
