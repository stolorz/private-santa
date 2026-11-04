import { processSingleton } from "@/lib/process-singleton";

export type RateLimitBucket = "auth" | "signup" | "guest";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

const WINDOWS: Record<RateLimitBucket, { max: number; windowMs: number }> = {
  auth: { max: 5, windowMs: 15 * 60 * 1000 },
  signup: { max: 5, windowMs: 60 * 60 * 1000 },
  guest: { max: 120, windowMs: 5 * 60 * 1000 },
};

const SWEEP_AFTER = 4000;

type Store = {
  hits: Map<string, number[]>;
  now: () => number;
};

function defaultNow(): number {
  return Date.now();
}

function store(): Store {
  return processSingleton("__santaRateLimit", () => ({
    hits: new Map<string, number[]>(),
    now: defaultNow,
  }));
}

/** True for Better Auth email sign-in, including a `basePath` prefix. */
export function isAuthSignInPath(pathname: string): boolean {
  return /\/api\/auth\/sign-in(?:\/|$)/.test(pathname);
}

/**
 * Sliding window. Missing IP is skipped in development and shares one
 * `"unknown"` bucket in production. One Node process only.
 */
export function consumeRateLimit(
  bucket: RateLimitBucket,
  ip: string | null,
): RateLimitResult {
  const ipKey =
    ip || (process.env.NODE_ENV === "production" ? "unknown" : null);
  if (!ipKey) return { ok: true };

  const { max, windowMs } = WINDOWS[bucket];
  const slot = store();
  const now = slot.now();
  const key = `${bucket}:${ipKey}`;
  const cutoff = now - windowMs;
  if (slot.hits.size > SWEEP_AFTER) {
    const prefix = `${bucket}:`;
    for (const [storedKey, stamps] of slot.hits) {
      if (!storedKey.startsWith(prefix)) continue;
      if (stamps.every((t) => t <= cutoff)) slot.hits.delete(storedKey);
    }
  }
  const recent = (slot.hits.get(key) ?? []).filter((t) => t > cutoff);
  const oldest = recent[0];
  if (oldest !== undefined && recent.length >= max) {
    slot.hits.set(key, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  recent.push(now);
  slot.hits.set(key, recent);
  return { ok: true };
}

export function setRateLimitNow(fn: () => number): void {
  store().now = fn;
}

export function resetRateLimit(): void {
  const slot = store();
  slot.hits.clear();
  slot.now = defaultNow;
}
