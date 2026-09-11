import { expect, test } from "bun:test";
import { db } from "../../src/db";
import { sql } from "drizzle-orm";
import { withTenant } from "../../src/db/tenant";

test("tenant context isolates tenant rows (students)", async () => {
  const schoolA = crypto.randomUUID();
  const schoolB = crypto.randomUUID();
  const studentA = crypto.randomUUID();
  const studentB = crypto.randomUUID();

  // Create schools outside RLS
  await db.execute(sql`INSERT INTO schools (id, name) VALUES (${schoolA}, ${`School A ${schoolA}`}), (${schoolB}, ${`School B ${schoolB}`})`);

  // Insert students in their respective tenant contexts
  await withTenant(schoolA, async (tx) => {
    await tx.execute(sql`INSERT INTO students (id, school_id, full_name) VALUES (${studentA}, ${schoolA}, 'Student A')`);
  });

  await withTenant(schoolB, async (tx) => {
    await tx.execute(sql`INSERT INTO students (id, school_id, full_name) VALUES (${studentB}, ${schoolB}, 'Student B')`);
  });

  // Query A should only see student A
  const countA = await withTenant(schoolA, async (tx) => {
    const result = await tx.execute(sql`SELECT id FROM students WHERE id IN (${studentA}, ${studentB})`);
    return result.count;
  });

  expect(countA).toBe(1);

  // Query B should only see student B
  const countB = await withTenant(schoolB, async (tx) => {
    const result = await tx.execute(sql`SELECT id FROM students WHERE id IN (${studentA}, ${studentB})`);
    return result.count;
  });

  expect(countB).toBe(1);
});
