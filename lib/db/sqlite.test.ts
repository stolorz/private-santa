import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openSqlite, sqlitePath } from "@/lib/db/sqlite";

const tmpRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data",
);
const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("sqlitePath", () => {
  it("defaults to data/santa.sqlite when SQLITE_PATH is unset", () => {
    const prev = process.env.SQLITE_PATH;
    delete process.env.SQLITE_PATH;
    try {
      expect(sqlitePath()).toBe("data/santa.sqlite");
    } finally {
      if (prev !== undefined) process.env.SQLITE_PATH = prev;
    }
  });

  it("uses SQLITE_PATH when set", () => {
    vi.stubEnv("SQLITE_PATH", "/tmp/santa.sqlite");
    expect(sqlitePath()).toBe("/tmp/santa.sqlite");
  });
});

describe("openSqlite", () => {
  it("creates the parent directory and sets WAL pragmas", () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    const dir = fs.mkdtempSync(path.join(tmpRoot, ".sqlite-test-"));
    dirs.push(dir);
    const file = path.join(dir, "nested", "santa.sqlite");
    const sqlite = openSqlite(file);
    expect(fs.existsSync(file)).toBe(true);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    sqlite.close();
  });

  it("opens an in-memory database without mkdir", () => {
    const sqlite = openSqlite(":memory:");
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    sqlite.close();
  });
});
