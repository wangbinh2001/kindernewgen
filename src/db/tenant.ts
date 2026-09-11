import { db } from "./index";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export type TenantTransaction = PgTransaction<PostgresJsQueryResultHKT, typeof schema, Extract<keyof typeof schema, string>>;

export async function withTenant<T>(schoolId: string, callback: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE newgen_app`);
    await tx.execute(sql`SELECT set_config('app.school_id', ${schoolId}, true)`);
    return await callback(tx);
  });
}
