import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { requireAuth, requireRole } from "../auth/middleware";
import { db } from "../db";
import { withTenant } from "../db/tenant";
import { getClientIp, recordAuditLog } from "../db/audit";
import { reportJobs } from "../db/schema";
import { dispatchReportJob } from "./service";
import { reportToCsv } from "./csv";

const reportType = z.enum(["tuition", "attendance", "nutrition"]);
const paramsSchema = z
  .object({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    month: z.string().date().optional(),
    classId: z.string().min(1).optional(),
  })
  .strict();

function claimsOf(context: Parameters<typeof requireAuth>[0]) {
  return context.get("auth").claims as TenantAccessTokenClaims;
}

export const reportRoutes = new Hono();
reportRoutes.use("*", requireAuth, requireRole("school_admin"));

reportRoutes.post("/", async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    body = null;
  }

  const parsed = z
    .object({
      type: reportType,
      parameters: paramsSchema.default({}),
    })
    .strict()
    .safeParse(body);

  if (!parsed.success) {
    return context.json(
      { success: false, data: null, error: { code: "VALIDATION_ERROR", message: "Invalid report request" } },
      400,
    );
  }

  const claims = claimsOf(context);
  const jobId = crypto.randomUUID();
  const [job] = await withTenant(claims.school_id, async (tx) =>
    tx
      .insert(reportJobs)
      .values({
        id: jobId,
        schoolId: claims.school_id,
        createdBy: claims.sub,
        type: parsed.data.type,
        status: "pending",
        parameters: parsed.data.parameters,
      })
      .returning(),
  );

  await recordAuditLog(db, {
    actorId: claims.sub,
    schoolId: claims.school_id,
    action: "create_report_job",
    targetType: "report_jobs",
    targetId: jobId,
    after: job,
    ipAddress: getClientIp(context),
  });

  dispatchReportJob(jobId, claims.school_id);

  return context.json(
    {
      success: true,
      data: { id: jobId, type: parsed.data.type, status: "pending" },
      error: null,
    },
    202,
  );
});

reportRoutes.get("/", async (context) => {
  const claims = claimsOf(context);
  const jobs = await withTenant(claims.school_id, async (tx) =>
    tx
      .select({
        id: reportJobs.id,
        type: reportJobs.type,
        status: reportJobs.status,
        parameters: reportJobs.parameters,
        errorMessage: reportJobs.errorMessage,
        createdAt: reportJobs.createdAt,
        completedAt: reportJobs.completedAt,
      })
      .from(reportJobs)
      .where(
        and(
          eq(reportJobs.schoolId, claims.school_id),
          eq(reportJobs.createdBy, claims.sub),
        ),
      )
      .orderBy(desc(reportJobs.createdAt))
      .limit(50),
  );

  return context.json({ success: true, data: jobs, error: null });
});

reportRoutes.get("/:id", async (context) => {
  const claims = claimsOf(context);
  const [job] = await withTenant(claims.school_id, async (tx) =>
    tx
      .select()
      .from(reportJobs)
      .where(
        and(
          eq(reportJobs.id, context.req.param("id")!),
          eq(reportJobs.schoolId, claims.school_id),
          eq(reportJobs.createdBy, claims.sub),
        ),
      ),
  );

  if (!job) {
    return context.json(
      { success: false, data: null, error: { code: "NOT_FOUND", message: "Report job not found" } },
      404,
    );
  }

  return context.json({ success: true, data: job, error: null });
});

reportRoutes.get("/:id/download", async (context) => {
  const claims = claimsOf(context);
  const [job] = await withTenant(claims.school_id, async (tx) =>
    tx
      .select()
      .from(reportJobs)
      .where(
        and(
          eq(reportJobs.id, context.req.param("id")!),
          eq(reportJobs.schoolId, claims.school_id),
          eq(reportJobs.createdBy, claims.sub),
        ),
      ),
  );

  if (!job) {
    return context.json(
      { success: false, data: null, error: { code: "NOT_FOUND", message: "Report job not found" } },
      404,
    );
  }
  if (job.status !== "completed" || !job.result) {
    return context.json(
      { success: false, data: null, error: { code: "REPORT_NOT_READY", message: "Report is not completed" } },
      409,
    );
  }

  const csv = reportToCsv(job.type, job.result);
  const safeType = job.type.replace(/[^a-z0-9-]/gi, "-");
  context.header("Content-Type", "text/csv; charset=utf-8");
  context.header("Content-Disposition", `attachment; filename=report-${safeType}-${job.id}.csv`);
  return context.body(csv);
});
