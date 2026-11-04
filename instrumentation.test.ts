import { beforeEach, describe, expect, it, vi } from "vitest";

const startBackgroundJobs = vi.hoisted(() => vi.fn());
const shortenRevealTokens = vi.hoisted(() => vi.fn());

vi.mock("@/lib/background-jobs", () => ({
  startBackgroundJobs,
}));

vi.mock("@/lib/shorten-reveal-tokens", () => ({
  shortenRevealTokens,
}));

import { register } from "./instrumentation";

describe("register", () => {
  beforeEach(() => {
    startBackgroundJobs.mockReset();
    shortenRevealTokens.mockReset();
  });

  it("no-ops when NEXT_RUNTIME is not nodejs", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NEXT_PHASE", "phase-development-server");

    await register();

    expect(shortenRevealTokens).not.toHaveBeenCalled();
    expect(startBackgroundJobs).not.toHaveBeenCalled();
  });

  it("no-ops during phase-production-build", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    await register();

    expect(shortenRevealTokens).not.toHaveBeenCalled();
    expect(startBackgroundJobs).not.toHaveBeenCalled();
  });

  it("shortens reveal tokens, then starts background jobs on the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-development-server");

    await register();

    expect(shortenRevealTokens).toHaveBeenCalledTimes(1);
    expect(startBackgroundJobs).toHaveBeenCalledTimes(1);
    expect(shortenRevealTokens.mock.invocationCallOrder[0]).toBeLessThan(
      startBackgroundJobs.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
