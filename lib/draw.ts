/**
 * Exclusion-aware secret-santa draw.
 *
 * Constraint solver: produce a derangement (nobody draws themselves,
 * unless self-draw is on) that respects forbidden pairs, and — when
 * possible — avoids repeating pairings from previous draws. History is
 * grouped by year (oldest first). Each layer is searched once (complete
 * backtracking, most-constrained giver first). If that search fails, the
 * oldest remaining year is dropped and the solver retries.
 */

import { DrawError } from "@/lib/errors";

export interface DrawResult {
  /** giver id -> receiver id */
  pairs: Map<number, number>;
  /** tryAssign calls across history-layer phases */
  attempts: number;
  /** wall time of this solve, in milliseconds */
  durationMs: number;
  /** how many oldest past-pairing years were dropped */
  layersDropped: number;
  /** true when at least one history layer had to be dropped */
  relaxedRestrictions: boolean;
}

export { DrawError };

/** Previous `giver -> receiver` pairs from a single past draw/year. */
export type HistoryLayer = Array<[number, number]>;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairKey(giver: number, receiver: number): string {
  return `${giver}->${receiver}`;
}

interface SolveOptions {
  /** givers taking part in this solve */
  givers: number[];
  /** receivers available to those givers (same length) */
  receivers: number[];
  /**
   * Forbidden ordered pairs as a set of `giver->receiver` keys.
   * Exclusions are symmetric, so callers should add both directions.
   */
  forbidden: Set<string>;
  /** when true, a giver may be matched to themselves (self-draw). */
  allowSelfDraw?: boolean;
}

function candidatesFor(
  giver: number,
  receivers: number[],
  used: Set<number>,
  forbidden: Set<string>,
  allowSelfDraw: boolean,
): number[] {
  return receivers.filter(
    (r) =>
      (allowSelfDraw || r !== giver) &&
      !used.has(r) &&
      !forbidden.has(pairKey(giver, r)),
  );
}

/**
 * Complete backtracking assignment. Each giver gets a distinct receiver
 * that is not forbidden, and (unless self-draw is allowed) not themselves.
 * Givers with the fewest remaining candidates are tried first. Returns
 * null if no assignment exists under these constraints.
 */
function tryAssign(opts: SolveOptions): Map<number, number> | null {
  const { givers: giverIds, receivers, forbidden, allowSelfDraw = false } =
    opts;
  const remaining = shuffle(giverIds);
  const used = new Set<number>();
  const pairs = new Map<number, number>();

  const backtrack = (): boolean => {
    if (remaining.length === 0) return true;

    let bestAt = 0;
    let bestCandidates = candidatesFor(
      remaining[0],
      receivers,
      used,
      forbidden,
      allowSelfDraw,
    );
    for (let i = 1; i < remaining.length; i++) {
      const options = candidatesFor(
        remaining[i],
        receivers,
        used,
        forbidden,
        allowSelfDraw,
      );
      if (
        options.length < bestCandidates.length ||
        (options.length === bestCandidates.length && Math.random() < 0.5)
      ) {
        bestAt = i;
        bestCandidates = options;
      }
    }

    const giver = remaining[bestAt];
    remaining.splice(bestAt, 1);
    for (const receiver of shuffle(bestCandidates)) {
      pairs.set(giver, receiver);
      used.add(receiver);
      if (backtrack()) return true;
      used.delete(receiver);
      pairs.delete(giver);
    }
    remaining.splice(bestAt, 0, giver);
    return false;
  };

  return backtrack() ? pairs : null;
}

/** Options controlling how a draw is solved. */
export interface RunDrawOptions {
  /** when true, a participant may draw themselves. Default false. */
  allowSelfDraw?: boolean;
  /**
   * Receivers to assign `ids` (givers) onto. Must be the same length as
   * `ids`. Defaults to `ids` (a permutation of one list).
   */
  receivers?: number[];
}

/**
 * Guests who still need a giver-assignment and guests who still need a
 * receiver-assignment. Order follows `guestIds`. The two lists are the
 * same people after a complete permutation; they differ after a pair is
 * removed from a cycle.
 */
export function leftoverIds(
  guestIds: number[],
  assignments: Array<{ giverId: number; receiverId: number }>,
): { givers: number[]; receivers: number[] } {
  const takenGivers = new Set(assignments.map((a) => a.giverId));
  const takenReceivers = new Set(assignments.map((a) => a.receiverId));
  return {
    givers: guestIds.filter((id) => !takenGivers.has(id)),
    receivers: guestIds.filter((id) => !takenReceivers.has(id)),
  };
}

function hardForbidden(exclusions: Array<[number, number]>): Set<string> {
  const hard = new Set<string>();
  for (const [a, b] of exclusions) {
    hard.add(pairKey(a, b));
    hard.add(pairKey(b, a));
  }
  return hard;
}

/** Whether leftover guests can still be drawn. */
export function drawReadiness(opts: {
  guestCount: number;
  leftoverGivers: number;
  leftoverReceivers: number;
  leftoverGiverId?: number;
  leftoverReceiverId?: number;
  disallowSelfDraw: boolean;
}): { everyoneGives: boolean; canDrawRemaining: boolean } {
  const everyoneGives = opts.guestCount > 0 && opts.leftoverGivers === 0;
  const canDrawRemaining =
    opts.leftoverGivers >= 2 ||
    (opts.leftoverGivers === 1 &&
      opts.leftoverReceivers === 1 &&
      (opts.leftoverGiverId !== opts.leftoverReceiverId ||
        !opts.disallowSelfDraw));
  return { everyoneGives, canDrawRemaining };
}

export function hasPastPairing(
  pastPairings: ReadonlyArray<readonly [number, number]>,
  giverId: number,
  receiverId: number,
): boolean {
  return pastPairings.some(
    ([giver, receiver]) => giver === giverId && receiver === receiverId,
  );
}

/**
 * Candidate receivers for each giver: leftover receivers minus self
 * (unless `allowSelfDraw`), symmetric exclusions, and any directed
 * `pastPairings` passed in `options`.
 *
 * Receiver order is preserved from `receivers`. A giver with no
 * allowed receiver maps to an empty array.
 */
export function possibleRecipientsByGiver(
  givers: number[],
  receivers: number[],
  exclusions: Array<[number, number]> = [],
  options: {
    allowSelfDraw?: boolean;
    pastPairings?: ReadonlyArray<readonly [number, number]>;
  } = {},
): Map<number, number[]> {
  const allowSelfDraw = options.allowSelfDraw ?? false;
  const forbidden = hardForbidden(exclusions);
  for (const [giver, receiver] of options.pastPairings ?? []) {
    forbidden.add(pairKey(giver, receiver));
  }
  // Nothing is assigned yet, so the shared candidate filter's used set stays empty.
  const used = new Set<number>();
  const map = new Map<number, number[]>();
  for (const g of givers) {
    map.set(g, candidatesFor(g, receivers, used, forbidden, allowSelfDraw));
  }
  return map;
}

function allHaveCandidates(
  givers: number[],
  receivers: number[],
  forbidden: Set<string>,
  allowSelfDraw: boolean,
): boolean {
  // Same hard-constraint check as `possibleRecipientsByGiver`; nobody is assigned yet.
  const used = new Set<number>();
  return givers.every(
    (g) =>
      candidatesFor(g, receivers, used, forbidden, allowSelfDraw).length > 0,
  );
}

/**
 * Run a draw.
 *
 * @param ids             giver ids. A full-group draw passes every guest;
 *                        a leftover draw passes only unassigned givers.
 *                        A permutation of one list needs at least 2 ids
 *                        unless self-draw is on (then 1 is allowed).
 * @param exclusions      symmetric forbidden pairs `[a, b]`
 * @param historyLayers   earlier editions' `giver->receiver` pairs, **oldest
 *                        first**. If a layer has no assignment the oldest
 *                        remaining layer is dropped (or immediately if
 *                        someone already has no candidate). `attempts`
 *                        counts solver searches only — dropping a layer
 *                        without calling the solver does not increment
 *                        them. An empty list (or dropping every layer)
 *                        keeps only hard exclusions.
 * @param options         extra solve options (`allowSelfDraw`, `receivers`)
 */
export function runDraw(
  ids: number[],
  exclusions: Array<[number, number]> = [],
  historyLayers: HistoryLayer[] = [],
  options: RunDrawOptions = {},
): DrawResult {
  const allowSelfDraw = options.allowSelfDraw ?? false;
  const givers = ids;
  const receivers = options.receivers ?? ids;
  const started = performance.now();

  if (givers.length !== receivers.length) {
    throw new DrawError("Giver and receiver lists must be the same length.");
  }
  if (givers.length === 0) {
    throw new DrawError("Need at least 2 participants to run a draw.");
  }
  // Full-group permutation of one list still needs ≥2 people, unless
  // self-draw turns a single leftover guest into 1→1.
  if (
    options.receivers == null &&
    givers.length < 2 &&
    !allowSelfDraw
  ) {
    throw new DrawError("Need at least 2 participants to run a draw.");
  }

  const hard = hardForbidden(exclusions);

  // Every giver must have ≥1 allowed receiver under hard exclusions.
  if (!allHaveCandidates(givers, receivers, hard, allowSelfDraw)) {
    throw new DrawError(
      "No valid assignment exists — exclusions are too restrictive.",
    );
  }

  const remaining = historyLayers.map(
    (layer) => new Set(layer.map(([g, r]) => pairKey(g, r))),
  );
  const initialLayers = remaining.length;
  let attempts = 0;

  // Forbid remaining history years; drop the oldest year if this
  // layer has no assignment (or immediately if someone already has
  // no candidate).
  while (true) {
    const forbidden = new Set(hard);
    for (const layer of remaining) {
      for (const key of layer) forbidden.add(key);
    }
    if (allHaveCandidates(givers, receivers, forbidden, allowSelfDraw)) {
      attempts += 1;
      const pairs = tryAssign({
        givers,
        receivers,
        forbidden,
        allowSelfDraw,
      });
      if (pairs) {
        const layersDropped = initialLayers - remaining.length;
        return {
          pairs,
          attempts,
          durationMs: Math.round(performance.now() - started),
          layersDropped,
          relaxedRestrictions: layersDropped > 0,
        };
      }
    }
    if (remaining.length === 0) break;
    remaining.shift();
  }

  throw new DrawError(
    "Could not find a valid assignment after many attempts — try relaxing exclusions.",
  );
}
