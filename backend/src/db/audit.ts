import type { Context } from "hono";
import { auditLogs } from "./schema";

export function getClientIp(context: Context): string | undefined {
  return context.req.header("x-forwarded-for")?.split(",")[0]?.trim();
}

export interface AuditLogPayload {
  actorType?: string; // defaults to 'user'
  actorId: string;
  schoolId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  extra?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAuditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any, // Accepts TenantTransaction or db instance
  payload: AuditLogPayload
) {
  const metadata: Record<string, unknown> = { ...payload.extra };
  if (payload.before !== undefined) metadata.before = payload.before;
  if (payload.after !== undefined) metadata.after = payload.after;

  await executor.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorType: payload.actorType ?? "user",
    actorId: payload.actorId,
    schoolId: payload.schoolId,
    action: payload.action,
    targetType: payload.targetType,
    targetId: payload.targetId,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    ipAddress: payload.ipAddress,
  });
}