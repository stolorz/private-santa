const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidOccursOn(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * True when `occursOn` is a real calendar date before today's UTC date.
 * Blank or invalid values are not past — a missing date is a different
 * failure from an event that has already happened.
 */
export function isOccursOnPast(occursOn: string, now = new Date()): boolean {
  if (!isValidOccursOn(occursOn)) return false;
  return occursOn < now.toISOString().slice(0, 10);
}

/** `25 Dec 2026` from a YYYY-MM-DD party date. */
export function formatOccursOn(occursOn: string): string {
  const [y, m, d] = occursOn.split("-").map(Number);
  if (!y || !m || !d) return occursOn;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
