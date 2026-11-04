import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_PATH = "data/santa.sqlite";

export function sqlitePath() {
  return process.env.SQLITE_PATH ?? DEFAULT_PATH;
}

/** Open a SQLite file with WAL + foreign keys. Caller owns the connection. */
export function openSqlite(file = sqlitePath()) {
  const dir = path.dirname(file);
  if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}
