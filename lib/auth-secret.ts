import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { AuthSecretStatus } from "@/lib/auth-secret-types";

export type { AuthSecretSource, AuthSecretStatus } from "@/lib/auth-secret-types";

/** Placeholder from `.env.example`. Unsafe in production. */
export const EXAMPLE_AUTH_SECRET = "change-me-to-a-long-random-string";

/** Better Auth's built-in fallback when neither env var is set. */
export const DEFAULT_AUTH_SECRET = "better-auth-secret-12345678901234567890";

const MIN_SECRET_LENGTH = 32;
const BETTER_KEY = "BETTER_AUTH_SECRET";
const AUTH_KEY = "AUTH_SECRET";

function envValue(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return env[name]?.trim() ?? "";
}

export function isWeakAuthSecret(value: string): boolean {
  return (
    value === EXAMPLE_AUTH_SECRET ||
    value === DEFAULT_AUTH_SECRET ||
    value.length < MIN_SECRET_LENGTH
  );
}

/**
 * Which env var Better Auth will use, and whether that value is a
 * placeholder / default / too short. Never returns the secret.
 */
export function authSecretStatus(
  env: Record<string, string | undefined> = process.env,
): AuthSecretStatus {
  const better = envValue(BETTER_KEY, env);
  if (better) {
    return { source: BETTER_KEY, weak: isWeakAuthSecret(better) };
  }
  const auth = envValue(AUTH_KEY, env);
  if (auth) {
    return { source: AUTH_KEY, weak: isWeakAuthSecret(auth) };
  }
  return { source: "default", weak: true };
}

/** Same strength as `openssl rand -base64 32`. */
export function generateAuthSecret(): string {
  return randomBytes(32).toString("base64");
}

function escapeDotenvValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Replace an uncommented `BETTER_AUTH_SECRET=` line, or append one.
 * Leaves comments and `AUTH_SECRET` alone. Always quotes the value.
 */
export function upsertDotenvSecret(fileText: string, value: string): string {
  const assignment = `${BETTER_KEY}="${escapeDotenvValue(value)}"`;
  const lineRe = /^[ \t]*BETTER_AUTH_SECRET[ \t]*=.*$/m;
  if (lineRe.test(fileText)) {
    return fileText.replace(lineRe, assignment);
  }
  const trimmed = fileText.replace(/\s+$/, "");
  if (trimmed === "") return `${assignment}\n`;
  return `${trimmed}\n${assignment}\n`;
}

function dotenvPath(): string {
  return path.resolve(process.env.AUTH_ENV_PATH || ".env");
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

async function readDotenv(): Promise<string> {
  try {
    return await fs.readFile(dotenvPath(), "utf8");
  } catch (error) {
    if (isEnoent(error)) return "";
    throw new DomainError("Could not write .env.");
  }
}

async function writeDotenv(text: string): Promise<void> {
  try {
    await fs.writeFile(dotenvPath(), text, "utf8");
  } catch {
    throw new DomainError("Could not write .env.");
  }
}

type MutableAuthContext = {
  secret: string;
  secretConfig?: unknown;
  options: { secret?: string };
};

async function applyLiveAuthSecret(secret: string): Promise<void> {
  process.env.BETTER_AUTH_SECRET = secret;
  const { auth } = await import("@/lib/auth");
  const ctx = (await auth.$context) as MutableAuthContext;
  ctx.secret = secret;
  ctx.options.secret = secret;
  ctx.secretConfig = secret;
}

/**
 * Mint a new `BETTER_AUTH_SECRET`, persist it to `.env`, apply it to the
 * running Better Auth instance, and delete organiser session rows.
 * Does not return the secret. Guest reveal tokens are untouched.
 */
export async function rotateAuthSecret(): Promise<AuthSecretStatus> {
  const next = generateAuthSecret();
  const current = await readDotenv();
  await writeDotenv(upsertDotenvSecret(current, next));
  await applyLiveAuthSecret(next);
  await db.delete(schema.session);
  return authSecretStatus();
}
