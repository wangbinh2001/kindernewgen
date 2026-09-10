import { expect, test } from "bun:test";
import { db } from "../../src/db";
import { sql } from "drizzle-orm";

test("Database connection works", async () => {
  const result = await db.execute(sql`SELECT 1 as num`);
  expect(result[0]?.num).toBe(1);
});
