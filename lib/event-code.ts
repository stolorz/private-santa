import {
  EVENT_CODE_ALPHABET,
  EVENT_CODE_LENGTH,
  EVENT_CODE_RE,
  RESERVED_FIRST_SEGMENTS,
  REVEAL_TOKEN_LENGTH,
  REVEAL_TOKEN_RE,
  eventCode,
  isReservedFirstSegment,
  revealToken,
  slugify,
} from "@/lib/ids";

export {
  EVENT_CODE_ALPHABET,
  EVENT_CODE_LENGTH,
  EVENT_CODE_RE,
  RESERVED_FIRST_SEGMENTS,
  REVEAL_TOKEN_LENGTH,
  REVEAL_TOKEN_RE,
  eventCode,
  isReservedFirstSegment,
  revealToken,
  slugify,
};
export {
  formatOccursOn,
  isOccursOnPast,
  isValidOccursOn,
} from "@/lib/occurs-on";
export { eventLabel } from "@/lib/event-name";

/**
 * A `revealToken()` that is not already in `used`. Reserved first segments
 * are skipped inside `revealToken`. This loop retries collisions with
 * `used` (20 attempts) and records the chosen id there.
 */
export function allocateUniqueRevealToken(used: Set<string>): string {
  for (let i = 0; i < 20; i++) {
    const token = revealToken();
    if (used.has(token)) continue;
    used.add(token);
    return token;
  }
  throw new Error("Could not allocate a reveal token.");
}

/** Newest party date first; ties break on createdAt then id. */
export function compareEventsByRecency(
  a: { occursOn: string; createdAt: Date | string; id?: number },
  b: { occursOn: string; createdAt: Date | string; id?: number },
): number {
  const byDate = b.occursOn.localeCompare(a.occursOn);
  if (byDate !== 0) return byDate;
  const byCreated =
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (byCreated !== 0) return byCreated;
  return (b.id ?? 0) - (a.id ?? 0);
}
