import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { FIXTURE_NOW, makeUser } from "@/test/helpers/fixtures";

const authContext = {
  secret: "old-secret",
  secretConfig: "old-secret",
  options: { secret: "old-secret" },
};

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/auth", () => ({
  auth: {
    $context: Promise.resolve(authContext),
  },
}));

import {
  DEFAULT_AUTH_SECRET,
  EXAMPLE_AUTH_SECRET,
  authSecretStatus,
  generateAuthSecret,
  rotateAuthSecret,
  upsertDotenvSecret,
} from "@/lib/auth-secret";

function makeSession(overrides: Partial<typeof schema.session.$inferSelect> = {}) {
  return {
    id: "sess_1",
    expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    token: "tok_1",
    ipAddress: null,
    userAgent: null,
    userId: "user_1",
    impersonatedBy: null,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    ...overrides,
  };
}

describe("authSecretStatus", () => {
  it("prefers BETTER_AUTH_SECRET over AUTH_SECRET", () => {
    expect(
      authSecretStatus({
        BETTER_AUTH_SECRET: "a".repeat(32),
        AUTH_SECRET: EXAMPLE_AUTH_SECRET,
      }),
    ).toEqual({ source: "BETTER_AUTH_SECRET", weak: false });
  });

  it("uses AUTH_SECRET when BETTER_AUTH_SECRET is blank", () => {
    expect(
      authSecretStatus({
        BETTER_AUTH_SECRET: "  ",
        AUTH_SECRET: "b".repeat(32),
      }),
    ).toEqual({ source: "AUTH_SECRET", weak: false });
  });

  it("reports the built-in default when neither env var is set", () => {
    expect(authSecretStatus({})).toEqual({ source: "default", weak: true });
  });

  it("flags the example placeholder and Better Auth default as weak", () => {
    expect(
      authSecretStatus({ BETTER_AUTH_SECRET: EXAMPLE_AUTH_SECRET }),
    ).toEqual({ source: "BETTER_AUTH_SECRET", weak: true });
    expect(authSecretStatus({ AUTH_SECRET: DEFAULT_AUTH_SECRET })).toEqual({
      source: "AUTH_SECRET",
      weak: true,
    });
  });

  it("flags secrets shorter than 32 characters as weak", () => {
    expect(authSecretStatus({ AUTH_SECRET: "short-secret" })).toEqual({
      source: "AUTH_SECRET",
      weak: true,
    });
  });
});

describe("upsertDotenvSecret", () => {
  it("replaces an uncommented BETTER_AUTH_SECRET line", () => {
    const next = upsertDotenvSecret(
      'AUTH_SECRET="keep"\nBETTER_AUTH_SECRET=old\nPORT=3001\n',
      "new+secret/=",
    );
    expect(next).toBe(
      'AUTH_SECRET="keep"\nBETTER_AUTH_SECRET="new+secret/="\nPORT=3001\n',
    );
  });

  it("does not rewrite a commented BETTER_AUTH_SECRET line", () => {
    const next = upsertDotenvSecret(
      "# BETTER_AUTH_SECRET=change-me-to-a-long-random-string\n",
      "fresh",
    );
    expect(next).toBe(
      '# BETTER_AUTH_SECRET=change-me-to-a-long-random-string\nBETTER_AUTH_SECRET="fresh"\n',
    );
  });

  it("appends when the key is missing, including an empty file", () => {
    expect(upsertDotenvSecret("", "abc")).toBe('BETTER_AUTH_SECRET="abc"\n');
    expect(upsertDotenvSecret("PORT=3001", "abc")).toBe(
      'PORT=3001\nBETTER_AUTH_SECRET="abc"\n',
    );
  });

  it("escapes quotes and backslashes in the value", () => {
    expect(upsertDotenvSecret("", 'say "hi"')).toBe(
      'BETTER_AUTH_SECRET="say \\"hi\\""\n',
    );
    expect(upsertDotenvSecret("", "a\\b")).toBe(
      'BETTER_AUTH_SECRET="a\\\\b"\n',
    );
  });
});

describe("generateAuthSecret", () => {
  it("returns a long random string", () => {
    const first = generateAuthSecret();
    const second = generateAuthSecret();
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(second).not.toBe(first);
    expect(first).not.toBe(EXAMPLE_AUTH_SECRET);
  });
});

describe("rotateAuthSecret", () => {
  const dirs: string[] = [];

  async function tmpEnv(name = ".env"): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-auth-"));
    dirs.push(dir);
    const file = path.join(dir, name);
    process.env.AUTH_ENV_PATH = file;
    return file;
  }

  beforeEach(() => {
    authContext.secret = "old-secret";
    authContext.secretConfig = "old-secret";
    authContext.options.secret = "old-secret";
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    mockDb.seed(schema.user, [makeUser({ id: "user_1", role: "admin" })]);
    mockDb.seed(schema.session, [
      makeSession(),
      makeSession({ id: "sess_2", token: "tok_2" }),
    ]);
  });

  afterEach(async () => {
    delete process.env.AUTH_ENV_PATH;
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("writes BETTER_AUTH_SECRET, applies it live, and wipes sessions", async () => {
    const file = await tmpEnv();
    await fs.writeFile(file, "PORT=3001\n");

    const status = await rotateAuthSecret();
    const written = await fs.readFile(file, "utf8");

    expect(status).toEqual({ source: "BETTER_AUTH_SECRET", weak: false });
    expect(JSON.stringify(status)).not.toContain(authContext.secret);
    expect(written).toMatch(/^PORT=3001\nBETTER_AUTH_SECRET="[^"]+"\n$/);
    expect(process.env.BETTER_AUTH_SECRET).toBe(authContext.secret);
    expect(authContext.options.secret).toBe(authContext.secret);
    expect(authContext.secretConfig).toBe(authContext.secret);
    expect(authContext.secret.length).toBeGreaterThanOrEqual(32);
    expect(mockDb.rows(schema.session)).toEqual([]);
  });

  it("creates .env when the file is missing", async () => {
    const file = await tmpEnv();

    await rotateAuthSecret();

    const written = await fs.readFile(file, "utf8");
    expect(written).toMatch(/^BETTER_AUTH_SECRET="[^"]+"\n$/);
    expect(mockDb.rows(schema.session)).toEqual([]);
  });

  it("writes .env in the cwd when AUTH_ENV_PATH is unset", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-auth-"));
    dirs.push(dir);
    const file = path.join(dir, ".env");
    delete process.env.AUTH_ENV_PATH;
    const resolve = path.resolve.bind(path);
    vi.spyOn(path, "resolve").mockImplementation((...args: string[]) => {
      if (args.length === 1 && args[0] === ".env") return file;
      return resolve(...args);
    });

    await rotateAuthSecret();

    const written = await fs.readFile(file, "utf8");
    expect(written).toMatch(/BETTER_AUTH_SECRET="/);
  });

  it("throws DomainError when writing .env fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-auth-"));
    dirs.push(dir);
    process.env.AUTH_ENV_PATH = path.join(dir, "missing", ".env");

    await expect(rotateAuthSecret()).rejects.toMatchObject({
      message: "Could not write .env.",
    });
    expect(mockDb.rows(schema.session)).toHaveLength(2);
  });

  it("throws DomainError when reading .env fails for a reason other than missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-auth-"));
    dirs.push(dir);
    process.env.AUTH_ENV_PATH = dir;

    await expect(rotateAuthSecret()).rejects.toMatchObject({
      message: "Could not write .env.",
    });
    expect(mockDb.rows(schema.session)).toHaveLength(2);
  });
});
