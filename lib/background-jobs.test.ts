import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_BOUNCE_FIRST_MS,
  EMAIL_BOUNCE_MS,
  SIGNAL_RECEIVE_MS,
  startBackgroundJobs,
} from "@/lib/background-jobs";
import { pollEmailBounces } from "@/lib/email-bounce";
import { keepSignalLinked } from "@/lib/signal";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/signal", () => ({
  keepSignalLinked: vi.fn(async () => {}),
}));

vi.mock("@/lib/email-bounce", () => ({
  pollEmailBounces: vi.fn(async () => 0),
}));

const NOW = new Date("2026-12-24T12:00:00.000Z");

type JobsGlobal = typeof globalThis & {
  __santaBackgroundJobs?: { started: boolean };
};

function jobsGlobal(): JobsGlobal {
  return globalThis as JobsGlobal;
}

describe("startBackgroundJobs", () => {
  beforeEach(() => {
    delete jobsGlobal().__santaBackgroundJobs;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(keepSignalLinked).mockReset();
    vi.mocked(keepSignalLinked).mockResolvedValue(undefined);
    vi.mocked(pollEmailBounces).mockReset();
    vi.mocked(pollEmailBounces).mockResolvedValue(0);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete jobsGlobal().__santaBackgroundJobs;
  });

  it("is idempotent via processSingleton", async () => {
    startBackgroundJobs();
    expect(jobsGlobal().__santaBackgroundJobs?.started).toBe(true);
    expect(console.log).toHaveBeenCalledWith("[jobs] started");

    startBackgroundJobs();
    startBackgroundJobs();
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it("does not schedule when the global flag is already set", async () => {
    jobsGlobal().__santaBackgroundJobs = { started: true };
    startBackgroundJobs();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(keepSignalLinked).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("receives Signal after 30s, then every 12 hours", async () => {
    startBackgroundJobs();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(keepSignalLinked).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(keepSignalLinked).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SIGNAL_RECEIVE_MS - 30_000 - 1);
    expect(keepSignalLinked).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(keepSignalLinked).toHaveBeenCalledTimes(2);
  });

  it("polls email bounces after 8s, then every 60s", async () => {
    startBackgroundJobs();

    await vi.advanceTimersByTimeAsync(EMAIL_BOUNCE_FIRST_MS - 1);
    expect(pollEmailBounces).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(pollEmailBounces).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(EMAIL_BOUNCE_MS - EMAIL_BOUNCE_FIRST_MS - 1);
    expect(pollEmailBounces).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(pollEmailBounces).toHaveBeenCalledTimes(2);
  });

  it("skips unref when the timer does not support it", () => {
    const timer = {} as NodeJS.Timeout;
    vi.spyOn(globalThis, "setTimeout").mockReturnValue(timer);
    vi.spyOn(globalThis, "setInterval").mockReturnValue(timer);
    startBackgroundJobs();
    expect(jobsGlobal().__santaBackgroundJobs?.started).toBe(true);
  });

  it("logs bounce poll failures", async () => {
    vi.mocked(pollEmailBounces).mockRejectedValue(new Error("imap down"));
    startBackgroundJobs();
    await vi.advanceTimersByTimeAsync(EMAIL_BOUNCE_FIRST_MS);
    expect(console.error).toHaveBeenCalledWith(
      "[jobs] bounce poll failed:",
      expect.any(Error),
    );
  });
});
