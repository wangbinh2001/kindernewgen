import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import {
  studentBalances,
  tuitionAdjustments,
  tuitionHistory,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { getClientIp, recordAuditLog } from "../db/audit";
import { internalError, notFoundError, validationError } from "../http/errors";

const adjustmentSchema = z
  .object({ amount: z.number().int(), reason: z.string().trim().min(1) })
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

function claimsOf(context: Context) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

export const adjustmentRoutes = new Hono();

adjustmentRoutes.post(
  "/history/:id/adjust",
  requireAuth,
  requireRole("school_admin"),
  async (context) => {
    const parsed = adjustmentSchema.safeParse(await readJson(context));
    if (!parsed.success)
      return validationError(context, "Invalid tuition adjustment");
    const schoolId = schoolIdOf(context);
    const claims = claimsOf(context);
    try {
      const result = await withTenant(schoolId, async (tx) => {
        const [history] = await tx
          .select()
          .from(tuitionHistory)
          .where(
            and(
              eq(tuitionHistory.id, context.req.param("id")!),
              eq(tuitionHistory.schoolId, schoolId),
            ),
          );
        if (!history) return { kind: "not_found" as const };
        if (history.state !== "confirmed")
          return { kind: "not_confirmed" as const };
        const [balance] = await tx
          .select()
          .from(studentBalances)
          .where(
            and(
              eq(studentBalances.schoolId, schoolId),
              eq(studentBalances.studentId, history.studentId),
              eq(studentBalances.period, history.month),
            ),
          )
          .for("update");
        if (!balance) return { kind: "missing_balance" as const };
        const [adjustment] = await tx
          .insert(tuitionAdjustments)
          .values({
            id: crypto.randomUUID(),
            schoolId,
            studentId: history.studentId,
            tuitionHistoryId: history.id,
            amount: parsed.data.amount,
            reason: parsed.data.reason,
            createdBy: claims.sub,
          })
          .returning();
        const adjustments = balance.adjustments + parsed.data.amount;
        const [updatedBalance] = await tx
          .update(studentBalances)
          .set({
            adjustments,
            closingAmount:
              balance.openingAmount +
              balance.charges -
              balance.payments +
              adjustments,
          })
          .where(eq(studentBalances.id, balance.id))
          .returning();

        if (adjustment) {
          await recordAuditLog(tx, {
            actorId: claims.sub,
            schoolId,
            action: "adjust_tuition",
            targetType: "tuition_adjustments",
            targetId: adjustment.id,
            after: adjustment,
            extra: { tuitionHistoryId: history.id, amount: parsed.data.amount },
            ipAddress: getClientIp(context),
          });
        }

        return {
          kind: "saved" as const,
          data: { adjustment, balance: updatedBalance },
        };
      });
      if (result.kind === "not_found")
        return notFoundError(context, "Tuition history not found");
      if (result.kind === "not_confirmed")
        return validationError(
          context,
          "Only confirmed tuition can be adjusted",
        );
      if (result.kind === "missing_balance")
        return validationError(context, "Student balance not found");
      return context.json({ success: true, data: result.data, error: null });
    } catch {
      return internalError(context);
    }
  },
);
