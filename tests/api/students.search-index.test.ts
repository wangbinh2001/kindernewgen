import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";

test("students search has the pg_trgm extension and GIN index", async () => {
  const [extension] = await db.execute(
    sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`,
  );
  expect(extension).toBeDefined();

  const [index] = await db.execute(sql`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'students'
      AND indexname = 'students_full_name_trgm_idx'
  `);
  expect(index?.indexdef).toContain("gin");
  expect(index?.indexdef).toContain("gin_trgm_ops");
});
