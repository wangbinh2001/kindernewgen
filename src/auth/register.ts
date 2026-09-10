import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { schoolMemberships, users } from "../db/schema";
import type { TenantTransaction } from "../db/tenant";

const DEFAULT_PARENT_PASSWORD = "123456";
const phoneSchema = z
  .string()
  .regex(/^0\d{9}$/, "Phone must be a valid Vietnamese phone number");

export type RegisterParentInput = {
  phone: string;
  schoolId: string;
  displayName: string;
};

async function registerParentInTransaction(
  tx: TenantTransaction,
  input: RegisterParentInput,
) {
  const phone = phoneSchema.parse(input.phone);
  const schoolId = input.schoolId.trim();
  const displayName = input.displayName.trim();

  if (!schoolId) {
    throw new Error("School ID is required");
  }

  if (!displayName) {
    throw new Error("Display name is required");
  }

  const existingUsers = await tx
    .select()
    .from(users)
    .where(eq(users.globalPhone, phone));
  const existingUser = existingUsers[0];

  if (existingUser) {
    await tx
      .insert(schoolMemberships)
      .values({
        id: crypto.randomUUID(),
        userId: existingUser.id,
        schoolId,
        role: "parent",
        status: "active",
      })
      .onConflictDoNothing();

    return { created: false as const, user: existingUser };
  }

  const passwordHash = await Bun.password.hash(DEFAULT_PARENT_PASSWORD, {
    algorithm: "argon2id",
  });
  const userId = crypto.randomUUID();
  const [user] = await tx
    .insert(users)
    .values({
      id: userId,
      globalPhone: phone,
      username: phone,
      passwordHash,
      displayName,
      mustChangePassword: true,
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create parent user");
  }

  await tx.insert(schoolMemberships).values({
    id: crypto.randomUUID(),
    userId: user.id,
    schoolId,
    role: "parent",
    status: "active",
  });

  return { created: true as const, user };
}

export async function registerParent(
  input: RegisterParentInput,
  transaction?: TenantTransaction,
) {
  if (transaction) {
    return registerParentInTransaction(transaction, input);
  }

  return db.transaction((tx) => registerParentInTransaction(tx, input));
}
