/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * Shortens stored reveal tokens, then starts Signal keep-alive and email
 * bounce polling (only on the Node.js runtime, never the Edge runtime
 * or during build).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Don't start a poller during `next build`.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { shortenRevealTokens } = await import("@/lib/shorten-reveal-tokens");
  shortenRevealTokens();
  const { startBackgroundJobs } = await import("@/lib/background-jobs");
  startBackgroundJobs();
}
