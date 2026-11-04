import { cache } from "react";

/**
 * Deduplicate a lookup within one React request.
 * Tests mock `react.cache` as identity so memoized results do not leak.
 */
export function requestCache<T extends (...args: never[]) => unknown>(
  fn: T,
): T {
  return cache(fn) as T;
}
