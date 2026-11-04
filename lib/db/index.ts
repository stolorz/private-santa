import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openSqlite } from "./sqlite";
import * as schema from "./schema";

// Reuse the connection across hot-reloads in dev so we don't open the
// file twice. During `next build` SQLITE_PATH may be unset — fall back
// to the default file so import never throws; queries only run at runtime.
const globalForDb = globalThis as unknown as {
  __sqlite?: InstanceType<typeof Database>;
};
const sqlite = globalForDb.__sqlite ?? openSqlite();
if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };

/** Query handle passed into `db.transaction` callbacks. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** `db` or a transaction — the two are not assignable to each other. */
export type DbHandle = typeof db | Tx;

/**
 * Drizzle select queries resolve to arrays; this returns the first row
 * or undefined.
 */
export async function first<T>(query: PromiseLike<T[]>): Promise<T | undefined> {
  return (await query)[0];
}
