import { expect, test } from "bun:test";
import { db } from "../../src/db";
import { sql } from "drizzle-orm";
import { withTenant } from "../../src/db/tenant";

test("tenant context isolates school rows", async () => {
  const schoolA = crypto.randomUUID();
  const schoolB = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.execute(sql`INSERT INTO schools (id, name) VALUES (${schoolA}, ${`School A ${schoolA}`}), (${schoolB}, ${`School B ${schoolB}`})`);
  });

  const result = await withTenant(schoolA, async (tx) => {
    return await tx.execute(sql`SELECT id FROM schools`);
  });

  expect(result.count).toBe(1);
});
