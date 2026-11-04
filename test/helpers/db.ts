/**
 * In-memory SQLite (real Drizzle + migrations) for unit tests.
 *
 * Rows are inserted through the same query API as production. `seed` /
 * `add` / `rows` keep the previous helper surface so tests can migrate
 * gradually. `inserts` / `updates` / `deletes` still record mutations for
 * assertions that have not switched to querying rows yet.
 *
 * `test/setup.ts` calls {@link mockDb.reset} in `afterEach`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { getTableName, type InferSelectModel, type Table } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/lib/db/schema";

type Row = Record<string, unknown>;

export type InsertCall = {
  table: Table;
  values: Row | Row[];
  onConflict?: unknown;
};
export type UpdateCall = { table: Table; set: Row; where?: unknown };
export type DeleteCall = { table: Table; where?: unknown };

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function createInstrumentedDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const raw = drizzle(sqlite, { schema });
  migrate(raw, { migrationsFolder: path.join(root, "drizzle") });
  sqlite.pragma("foreign_keys = ON");

  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const deletes: DeleteCall[] = [];
  const wrapped = new WeakSet<object>();
  let recording = true;

  function wrap(handle: Db | Tx): void {
    if (wrapped.has(handle)) return;
    wrapped.add(handle);

    const origInsert = handle.insert.bind(handle);
    const origUpdate = handle.update.bind(handle);
    const origDelete = handle.delete.bind(handle);

    handle.insert = ((table: Table) => {
      const builder = origInsert(table);
      const origValues = builder.values.bind(builder);
      builder.values = (values: Row | Row[]) => {
        if (recording) inserts.push({ table, values });
        return origValues(values);
      };
      return builder;
    }) as typeof handle.insert;

    handle.update = ((table: Table) => {
      const builder = origUpdate(table);
      const origSet = builder.set.bind(builder);
      builder.set = (values: Row) => {
        const afterSet = origSet(values);
        const origWhere = afterSet.where.bind(afterSet);
        afterSet.where = (cond?: unknown) => {
          if (recording) updates.push({ table, set: values, where: cond });
          return origWhere(cond as never);
        };
        return afterSet;
      };
      return builder;
    }) as typeof handle.update;

    handle.delete = ((table: Table) => {
      const builder = origDelete(table);
      const origWhere = builder.where.bind(builder);
      builder.where = (cond?: unknown) => {
        if (recording) deletes.push({ table, where: cond });
        return origWhere(cond as never);
      };
      return builder;
    }) as typeof handle.delete;
  }

  wrap(raw);
  const origTx = raw.transaction.bind(raw);
  raw.transaction = ((fn: (tx: Tx) => unknown, config?: unknown) =>
    origTx((tx) => {
      wrap(tx);
      return fn(tx);
    }, config as never)) as typeof raw.transaction;

  function tableNames(): string[] {
    return (
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name NOT LIKE 'sqlite_%'
             AND name NOT LIKE '__drizzle%'`,
        )
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
  }

  function withForeignKeysOff(fn: () => void) {
    sqlite.pragma("foreign_keys = OFF");
    try {
      fn();
    } finally {
      sqlite.pragma("foreign_keys = ON");
    }
  }

  function withoutRecording(fn: () => void) {
    recording = false;
    try {
      fn();
    } finally {
      recording = true;
    }
  }

  return {
    db: raw,
    sqlite,
    inserts,
    updates,
    deletes,
    seed(table: Table, rows: Row[]) {
      withoutRecording(() => {
        withForeignKeysOff(() => {
          sqlite.exec(`DELETE FROM "${getTableName(table)}"`);
          if (rows.length > 0) raw.insert(table).values(rows).run();
        });
      });
    },
    add(table: Table, ...rows: Row[]) {
      if (rows.length === 0) return;
      withoutRecording(() => {
        withForeignKeysOff(() => {
          raw.insert(table).values(rows).run();
        });
      });
    },
    rows<T extends Table>(table: T): InferSelectModel<T>[] {
      return raw.select().from(table).all() as InferSelectModel<T>[];
    },
    reset() {
      withoutRecording(() => {
        withForeignKeysOff(() => {
          for (const name of tableNames()) {
            sqlite.exec(`DELETE FROM "${name}"`);
          }
          sqlite.exec("DELETE FROM sqlite_sequence");
        });
      });
      inserts.length = 0;
      updates.length = 0;
      deletes.length = 0;
    },
    tableName: getTableName,
  };
}

export async function first<T>(query: PromiseLike<T[]>): Promise<T | undefined> {
  return (await query)[0];
}

export const mockDb = createInstrumentedDb();

export async function mockLibDb() {
  return { db: mockDb.db, schema, first };
}
