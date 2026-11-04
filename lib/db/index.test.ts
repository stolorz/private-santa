import { describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", () => {
  class MockDatabase {
    pragma() {}
  }
  return { default: MockDatabase };
});

vi.mock("node:fs", () => ({
  default: { mkdirSync: () => {} },
  mkdirSync: () => {},
}));

vi.mock("drizzle-orm/better-sqlite3", () => ({
  drizzle: () => ({}),
}));

import { first } from "@/lib/db";

describe("sqlite cache", () => {
  it("does not stash the connection on globalThis in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    delete (globalThis as { __sqlite?: unknown }).__sqlite;
    await import("@/lib/db");
    expect((globalThis as { __sqlite?: unknown }).__sqlite).toBeUndefined();
  });
});

describe("first", () => {
  it("returns undefined for an empty list", async () => {
    expect(await first(Promise.resolve([]))).toBeUndefined();
  });

  it("returns the first element of a non-empty list", async () => {
    expect(await first(Promise.resolve(["a", "b"]))).toBe("a");
  });
});
