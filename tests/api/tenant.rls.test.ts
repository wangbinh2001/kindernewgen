import { expect, test } from "bun:test";
import { db } from "../../src/db";
import { sql } from "drizzle-orm";
import { withTenant } from "../../src/db/tenant";

test("tenant context isolates school rows", async () => {
  const schoolA = crypto.randomUUID();
  const schoolB = crypto.randomUUID();

  await withTenant(schoolA, async (tx) => {
    await tx.execute(sql`INSERT INTO schools (id, name) VALUES (${schoolA}, ${`School A ${schoolA}`})`);
  });

  await withTenant(schoolB, async (tx) => {
    await tx.execute(sql`INSERT INTO schools (id, name) VALUES (${schoolB}, ${`School B ${schoolB}`})`);
  });

  const countA = await withTenant(schoolA, async (tx) => {
    const result = await tx.execute(sql`SELECT id FROM schools WHERE id IN (${schoolA}, ${schoolB})`);
    return result.count;
  });

  expect(countA).toBe(1);

  const countB = await withTenant(schoolB, async (tx) => {
    const result = await tx.execute(sql`SELECT id FROM schools WHERE id IN (${schoolA}, ${schoolB})`);
    return result.count;
  });

  expect(countB).toBe(1);
});
