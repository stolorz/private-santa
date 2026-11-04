import { compareNames } from "@/lib/person-name";

export type ExclusionPair = { aId: number; bId: number };

/** Left name first, right name second, alphabetically (Polish-aware). */
export function orderedExclusionNames(
  a: string,
  b: string,
): [string, string] {
  return compareNames(a, b) <= 0 ? [a, b] : [b, a];
}

/** True when both rows are the same undirected pair (A⇄B equals B⇄A). */
export function isSameExclusionPair(
  a: ExclusionPair,
  b: ExclusionPair,
): boolean {
  return (
    (a.aId === b.aId && a.bId === b.bId) ||
    (a.aId === b.bId && a.bId === b.aId)
  );
}

export function hasExclusionPair(
  rows: ExclusionPair[],
  aId: number,
  bId: number,
): boolean {
  return rows.some((row) => isSameExclusionPair(row, { aId, bId }));
}
