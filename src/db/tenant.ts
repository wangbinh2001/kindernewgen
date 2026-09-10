import { db } from "./index";
import { sql } from "drizzle-orm";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type * as schema from "./schema";

export type TenantTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export async function withTenant<T>(
  schoolId: string,
  callback: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.school_id', ${schoolId}, true)`,
    );
    return await callback(tx);
  });
}
