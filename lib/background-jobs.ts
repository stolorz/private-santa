import "server-only";
import { pollEmailBounces } from "@/lib/email-bounce";
import { processSingleton } from "@/lib/process-singleton";
import { keepSignalLinked } from "@/lib/signal";

/** Signal drops a linked device after ~30 days idle. Check in twice a day. */
export const SIGNAL_RECEIVE_MS = 12 * 60 * 60 * 1000;
export const SIGNAL_RECEIVE_FIRST_MS = 30_000;
export const EMAIL_BOUNCE_MS = 60_000;
export const EMAIL_BOUNCE_FIRST_MS = 8_000;

const jobsState = () =>
  processSingleton("__santaBackgroundJobs", () => ({ started: false }));

function every(
  fn: () => Promise<unknown>,
  firstMs: number,
  intervalMs: number,
  onError?: (error: unknown) => void,
) {
  const run = () =>
    void fn().catch((error) => {
      onError?.(error);
    });
  setTimeout(run, firstMs);
  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
}

/**
 * Start in-process background jobs. Idempotent across hot-reloads /
 * repeated imports via a global flag. Called from `instrumentation.ts`
 * on boot.
 */
export function startBackgroundJobs() {
  const state = jobsState();
  if (state.started) return;
  state.started = true;

  console.log("[jobs] started");
  every(() => keepSignalLinked(), SIGNAL_RECEIVE_FIRST_MS, SIGNAL_RECEIVE_MS);
  every(
    () => pollEmailBounces(),
    EMAIL_BOUNCE_FIRST_MS,
    EMAIL_BOUNCE_MS,
    (e) => console.error("[jobs] bounce poll failed:", e),
  );
}
