import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { systemAdmins } from "../src/db/schema";

const username = process.env.ADMIN_USER?.trim();
const password = process.env.ADMIN_PASS;

if (!username || !password) {
  throw new Error("ADMIN_USER and ADMIN_PASS are required");
}

const [existing] = await db
  .select({ id: systemAdmins.id })
  .from(systemAdmins)
  .where(eq(systemAdmins.username, username));

if (existing) {
  console.log(`System admin ${username} already exists`);
} else {
  await db.insert(systemAdmins).values({
    id: crypto.randomUUID(),
    username,
    passwordHash: await Bun.password.hash(password, { algorithm: "argon2id" }),
    displayName: process.env.ADMIN_DISPLAY_NAME?.trim() || username,
  });
  console.log(`Created system admin ${username}`);
}
