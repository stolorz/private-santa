import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeRateLimit,
  isAuthSignInPath,
  resetRateLimit,
  setRateLimitNow,
} from "@/lib/rate-limit";

describe("isAuthSignInPath", () => {
  it("matches sign-in with or without a basePath prefix", () => {
    expect(isAuthSignInPath("/api/auth/sign-in/email")).toBe(true);
    expect(
      isAuthSignInPath("/your-prefix/api/auth/sign-in/email"),
    ).toBe(true);
    expect(isAuthSignInPath("/api/auth/sign-in")).toBe(true);
  });

  it("ignores session and other auth paths", () => {
    expect(isAuthSignInPath("/api/auth/session")).toBe(false);
    expect(isAuthSignInPath("/api/auth/sign-up/email")).toBe(false);
    expect(isAuthSignInPath("/api/signup")).toBe(false);
  });
});

describe("consumeRateLimit", () => {
  afterEach(() => {
    resetRateLimit();
    vi.unstubAllEnvs();
  });

  it("allows a missing IP outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    for (let i = 0; i < 8; i++) {
      expect(consumeRateLimit("auth", null)).toEqual({ ok: true });
    }
  });

  it("shares an unknown bucket in production when IP is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit("auth", null).ok).toBe(true);
    }
    expect(consumeRateLimit("auth", null)).toEqual({
      ok: false,
      retryAfterSec: expect.any(Number),
    });
    expect(consumeRateLimit("auth", "203.0.113.9").ok).toBe(true);
  });

  it("isolates IPs and buckets", () => {
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit("auth", "203.0.113.1").ok).toBe(true);
    }
    expect(consumeRateLimit("auth", "203.0.113.1").ok).toBe(false);
    expect(consumeRateLimit("auth", "203.0.113.2").ok).toBe(true);
    expect(consumeRateLimit("signup", "203.0.113.1").ok).toBe(true);
  });

  it("returns retryAfterSec and opens again after the window", () => {
    let now = 1_000_000;
    setRateLimitNow(() => now);
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit("auth", "203.0.113.9").ok).toBe(true);
      now += 1;
    }
    const blocked = consumeRateLimit("auth", "203.0.113.9");
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("expected block");
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    now += 15 * 60 * 1000;
    expect(consumeRateLimit("auth", "203.0.113.9").ok).toBe(true);
  });

  it("caps guest traffic at 120 hits per 5 minutes", () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 120; i++) {
      expect(consumeRateLimit("guest", ip).ok).toBe(true);
    }
    expect(consumeRateLimit("guest", ip).ok).toBe(false);
  });

  it("sweeps expired keys of the consumed bucket when the map is large", () => {
    let now = 1_000_000;
    setRateLimitNow(() => now);
    for (let i = 0; i < 4001; i++) {
      expect(consumeRateLimit("auth", `203.0.113.${i}`).ok).toBe(true);
    }
    now += 1000;
    expect(consumeRateLimit("auth", "198.51.100.1").ok).toBe(true);
    now += 15 * 60 * 1000;
    expect(consumeRateLimit("guest", "198.51.100.9").ok).toBe(true);
    expect(consumeRateLimit("auth", "198.51.100.2").ok).toBe(true);
  });
});
