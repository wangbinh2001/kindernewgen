import { and, eq, inArray } from "drizzle-orm";
import type { TenantTransaction } from "../db/tenant";
import { notifications, parentChildren, schoolMemberships } from "../db/schema";
import { realtimeHub } from "../realtime/sse";

export type NotificationInput = {
  schoolId: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
};

export async function createNotifications(
  tx: TenantTransaction,
  inputs: NotificationInput[],
) {
  if (!inputs.length) return;
  const rows = inputs.map((input) => ({ id: crypto.randomUUID(), ...input }));
  await tx.insert(notifications).values(rows);

  for (const item of rows) {
    realtimeHub.sendToUser(item.recipientId, "notification", {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      entityType: item.entityType,
      entityId: item.entityId,
      data: item.data,
    });
  }
}

export async function notifySchoolRoles(
  tx: TenantTransaction,
  schoolId: string,
  roles: string[],
  input: Omit<NotificationInput, "schoolId" | "recipientId">,
) {
  const recipients = await tx
    .select({ userId: schoolMemberships.userId })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.status, "active"),
        inArray(schoolMemberships.role, roles),
      ),
    );
  await createNotifications(
    tx,
    recipients.map(({ userId }) => ({
      ...input,
      schoolId,
      recipientId: userId,
    })),
  );
}

export async function notifyParentsOfStudents(
  tx: TenantTransaction,
  schoolId: string,
  studentIds: string[],
  input: Omit<NotificationInput, "schoolId" | "recipientId">,
) {
  if (!studentIds.length) return;
  const links = await tx
    .select({ parentId: parentChildren.parentId })
    .from(parentChildren)
    .where(inArray(parentChildren.childId, studentIds));
  await createNotifications(
    tx,
    links.map(({ parentId }) => ({
      ...input,
      schoolId,
      recipientId: parentId,
    })),
  );
}
