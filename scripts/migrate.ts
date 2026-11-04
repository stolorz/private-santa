/**
 * Apply pending Drizzle migrations against the local SQLite file.
 *
 * Used by `npm run db:migrate`. Uses drizzle-orm's runtime migrator (no
 * drizzle-kit at runtime); it only needs the SQL files in ./drizzle and
 * SQLITE_PATH (default `data/santa.sqlite`).
 *
 * Databases that already ran the pre-squash journal can have
 * `__drizzle_migrations.created_at` newer than later files, so the
 * migrator skips them. Apply those files directly when their sentinel
 * columns are still missing, or when `event.budget_eur` is still INTEGER
 * or `event.name_en` / `event.name_ja` is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openSqlite } from "../lib/db/sqlite";
import { materializeMissingEventTemplatesOn } from "../lib/templates/event-rows";
import { readReferenceTemplates } from "../lib/templates/reference";

const sqlite = openSqlite();
const db = drizzle(sqlite);

function tableInfo(table: string) {
  return sqlite.prepare(`pragma table_info(${table})`).all() as {
    name: string;
    type: string;
  }[];
}

function tableHasColumn(table: string, column: string) {
  return tableInfo(table).some((col) => col.name === column);
}

function columnType(table: string, column: string): string | undefined {
  return tableInfo(table).find((col) => col.name === column)?.type;
}

function applySqlFile(file: string) {
  const sql = fs.readFileSync(path.join("drizzle", file), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement && !/^PRAGMA\s+/i.test(statement));
  sqlite.transaction(() => {
    for (const statement of statements) sqlite.exec(statement);
  })();
}

function applySkippedMigration(
  file: string,
  table: string,
  column: string,
): boolean {
  if (tableHasColumn(table, column)) return false;
  applySqlFile(file);
  return true;
}

function applySkippedMigrationWhenType(
  file: string,
  table: string,
  column: string,
  type: string,
): boolean {
  if (columnType(table, column)?.toUpperCase() !== type.toUpperCase()) {
    return false;
  }
  applySqlFile(file);
  return true;
}

try {
  sqlite.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  if (applySkippedMigration("0001_noisy_firedrake.sql", "person", "name_normalized")) {
    console.log("Applied 0001 (drizzle skipped it on this database).");
  }
  if (applySkippedMigration("0002_dusty_stellaris.sql", "event", "budget_eur")) {
    console.log("Applied 0002 (drizzle skipped it on this database).");
  }
  if (
    applySkippedMigrationWhenType(
      "0003_lonely_black_widow.sql",
      "event",
      "budget_eur",
      "INTEGER",
    )
  ) {
    console.log("Applied 0003 (drizzle skipped it on this database).");
  }
  if (applySkippedMigration("0004_ambiguous_micromax.sql", "event", "name_en")) {
    console.log("Applied 0004 (drizzle skipped it on this database).");
  }
  if (applySkippedMigration("0005_event_name_ja.sql", "event", "name_ja")) {
    console.log("Applied 0005 (drizzle skipped it on this database).");
  }
  if (applySkippedMigration("0007_budget_kind.sql", "event", "budget_kind")) {
    console.log("Applied 0007 (drizzle skipped it on this database).");
  }
  if (
    applySkippedMigration(
      "0009_event_template.sql",
      "event_template",
      "event_id",
    )
  ) {
    console.log("Applied 0009 (drizzle skipped it on this database).");
  }
  if (
    applySkippedMigration(
      "0011_event_automatic_exclusions.sql",
      "event",
      "allow_self_draw",
    )
  ) {
    console.log("Applied 0011 (drizzle skipped it on this database).");
  }
  const snapped = materializeMissingEventTemplatesOn(
    db as never,
    readReferenceTemplates(),
  );
  if (snapped > 0) {
    console.log(`Snapshotted templates for ${snapped} edition(s).`);
  }
} catch (e) {
  console.error("Migration failed:", e);
  process.exitCode = 1;
} finally {
  sqlite.pragma("foreign_keys = ON");
  sqlite.close();
}
