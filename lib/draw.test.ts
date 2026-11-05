import { describe, expect, it } from "vitest";
import {
  DrawError,
  drawReadiness,
  hasPastPairing,
  leftoverIds,
  possibleRecipientsByGiver,
  runDraw,
} from "./draw";

const RUNS = 200;

describe("runDraw", () => {
  it("throws with fewer than 2 participants", () => {
    expect(() => runDraw([1])).toThrow(DrawError);
    expect(() => runDraw([1])).toThrow(
      "Need at least 2 participants to run a draw.",
    );
  });

  it("throws DrawError when the id list is empty", () => {
    expect(() => runDraw([])).toThrow(DrawError);
  });

  it("produces a valid derangement (no self-assignment)", () => {
    const ids = [1, 2, 3, 4, 5, 6];
    for (let i = 0; i < RUNS; i++) {
      const { pairs, attempts, durationMs, layersDropped, relaxedRestrictions } =
        runDraw(ids);
      // everyone is a giver exactly once
      expect([...pairs.keys()].sort()).toEqual(ids);
      // everyone is a receiver exactly once
      expect([...pairs.values()].sort()).toEqual(ids);
      // nobody draws themselves
      for (const [g, r] of pairs) expect(g).not.toBe(r);
      expect(attempts).toBeGreaterThan(0);
      expect(durationMs).toBeGreaterThanOrEqual(0);
      expect(layersDropped).toBe(0);
      expect(relaxedRestrictions).toBe(false);
    }
  });

  it("respects symmetric exclusions across many runs", () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const exclusions: Array<[number, number]> = [
      [1, 2],
      [3, 4],
    ];
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw(ids, exclusions);
      expect(pairs.get(1)).not.toBe(2);
      expect(pairs.get(2)).not.toBe(1);
      expect(pairs.get(3)).not.toBe(4);
      expect(pairs.get(4)).not.toBe(3);
    }
  });

  it("avoids history when feasible (soft constraint)", () => {
    const ids = [1, 2, 3, 4, 5];
    // a previous draw's cycle
    const history: Array<Array<[number, number]>> = [
      [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 1],
      ],
    ];
    let repeats = 0;
    for (let i = 0; i < RUNS; i++) {
      const { pairs, relaxedRestrictions, layersDropped } = runDraw(
        ids,
        [],
        history,
      );
      expect(relaxedRestrictions).toBe(false);
      expect(layersDropped).toBe(0);
      for (const [g, r] of history[0]) if (pairs.get(g) === r) repeats++;
    }
    // with 5 people there is plenty of room — should essentially never repeat
    expect(repeats).toBe(0);
  });

  it("relaxes history when avoiding it would make the draw impossible", () => {
    // 2 people: the only derangement is 1→2, 2→1. If that is also history,
    // the first search fails; dropping that year still returns it.
    const { pairs, layersDropped, relaxedRestrictions } = runDraw(
      [1, 2],
      [],
      [
        [
          [1, 2],
          [2, 1],
        ],
      ],
    );
    expect(pairs.get(1)).toBe(2);
    expect(pairs.get(2)).toBe(1);
    expect(layersDropped).toBe(1);
    expect(relaxedRestrictions).toBe(true);
  });

  it("relaxes history that covers every derangement edge", () => {
    // n=3 has two derangements (the two 3-cycles). If one year forbids both,
    // that year is dropped and phase-hard still returns a valid derangement.
    const ids = [1, 2, 3];
    const history: Array<Array<[number, number]>> = [
      [
        [1, 2],
        [2, 3],
        [3, 1],
        [1, 3],
        [3, 2],
        [2, 1],
      ],
    ];
    const { pairs, layersDropped, relaxedRestrictions } = runDraw(
      ids,
      [],
      history,
    );
    expect([...pairs.keys()].sort()).toEqual(ids);
    expect([...pairs.values()].sort()).toEqual(ids);
    for (const [g, r] of pairs) expect(g).not.toBe(r);
    expect(layersDropped).toBe(1);
    expect(relaxedRestrictions).toBe(true);
  });

  it("drops the oldest year first when two years cover every derangement", () => {
    // n=3: the two derangements are the two 3-cycles. Oldest year is cycle
    // A, newest is cycle B. Together they forbid every derangement edge;
    // after dropping the oldest year the result must be cycle A (avoiding
    // the newer year).
    const ids = [1, 2, 3];
    const oldest: Array<[number, number]> = [
      [1, 2],
      [2, 3],
      [3, 1],
    ];
    const newest: Array<[number, number]> = [
      [1, 3],
      [3, 2],
      [2, 1],
    ];
    const { pairs, layersDropped, relaxedRestrictions } = runDraw(
      ids,
      [],
      [oldest, newest],
    );
    expect(pairs.get(1)).toBe(2);
    expect(pairs.get(2)).toBe(3);
    expect(pairs.get(3)).toBe(1);
    expect(layersDropped).toBe(1);
    expect(relaxedRestrictions).toBe(true);
  });

  it("uses self-draw in the first pass when history forbids the only derangement", () => {
    // Same 2-person history as the relaxation case, but self-draw is on
    // so the first pass can assign 1→1, 2→2 instead of dropping the year.
    const { pairs, layersDropped, relaxedRestrictions } = runDraw(
      [1, 2],
      [],
      [
        [
          [1, 2],
          [2, 1],
        ],
      ],
      { allowSelfDraw: true },
    );
    expect(pairs.get(1)).toBe(1);
    expect(pairs.get(2)).toBe(2);
    expect(layersDropped).toBe(0);
    expect(relaxedRestrictions).toBe(false);
  });

  it("treats history as directed, not symmetric", () => {
    const ids = [1, 2, 3, 4];
    const history: Array<Array<[number, number]>> = [[[1, 2]]];
    let twoGetsOne = 0;
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw(ids, [], history);
      expect(pairs.get(1)).not.toBe(2);
      if (pairs.get(2) === 1) twoGetsOne++;
    }
    expect(twoGetsOne).toBeGreaterThan(0);
  });

  it("throws when exclusions make assignment impossible", () => {
    // 2 people who exclude each other: only possible pairing is forbidden
    expect(() => runDraw([1, 2], [[1, 2]])).toThrow(DrawError);
  });

  it("still produces a full permutation when self-draw is allowed", () => {
    const ids = [1, 2, 3, 4, 5];
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw(ids, [], [], { allowSelfDraw: true });
      expect([...pairs.keys()].sort()).toEqual(ids);
      expect([...pairs.values()].sort()).toEqual(ids);
    }
  });

  it("allows self-assignment in the only-possible case when self-draw is on", () => {
    // 2 people who exclude each other: a derangement is impossible, but with
    // self-draw each gives to themselves.
    const { pairs } = runDraw([1, 2], [[1, 2]], [], { allowSelfDraw: true });
    expect(pairs.get(1)).toBe(1);
    expect(pairs.get(2)).toBe(2);
  });

  it("still honours exclusions when self-draw is allowed", () => {
    const ids = [1, 2, 3, 4];
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw(ids, [[1, 2]], [], { allowSelfDraw: true });
      expect(pairs.get(1)).not.toBe(2);
      expect(pairs.get(2)).not.toBe(1);
    }
  });

  it("honours a self-exclusion when self-draw is allowed", () => {
    const ids = [1, 2, 3, 4];
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw(ids, [[1, 1]], [], { allowSelfDraw: true });
      expect(pairs.get(1)).not.toBe(1);
    }
  });

  it("assigns leftover givers onto a different leftover receiver list", () => {
    const { pairs } = runDraw([1], [], [], { receivers: [3] });
    expect(pairs.get(1)).toBe(3);
    expect([...pairs.keys()]).toEqual([1]);
    expect([...pairs.values()]).toEqual([3]);
  });

  it("does not assign leftover givers to people already taken as receivers", () => {
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw([3, 4], [], [], { receivers: [3, 4] });
      expect([...pairs.keys()].sort()).toEqual([3, 4]);
      expect([...pairs.values()].sort()).toEqual([3, 4]);
      expect(pairs.get(3)).not.toBe(1);
      expect(pairs.get(3)).not.toBe(2);
      expect(pairs.get(4)).not.toBe(1);
      expect(pairs.get(4)).not.toBe(2);
    }
  });

  it("assigns a single leftover self-pair when self-draw is on", () => {
    const { pairs } = runDraw([7], [], [], { allowSelfDraw: true });
    expect(pairs.get(7)).toBe(7);
  });

  it("rejects a single leftover self-pair when self-draw is off", () => {
    expect(() => runDraw([7])).toThrow(DrawError);
    expect(() => runDraw([7])).toThrow(
      "Need at least 2 participants to run a draw.",
    );
  });

  it("rejects a single leftover self-pair even with receivers set, when self-draw is off", () => {
    expect(() => runDraw([7], [], [], { receivers: [7] })).toThrow(DrawError);
    expect(() => runDraw([7], [], [], { receivers: [7] })).toThrow(
      "No valid assignment exists — exclusions are too restrictive.",
    );
  });

  it("throws when giver and receiver lists differ in length", () => {
    expect(() => runDraw([1, 2], [], [], { receivers: [3] })).toThrow(
      DrawError,
    );
  });

  it("respects exclusions on a leftover giver/receiver solve", () => {
    expect(() =>
      runDraw([1], [[1, 3]], [], { receivers: [3] }),
    ).toThrow(DrawError);
  });

  it("handles a tightly-constrained-but-solvable case", () => {
    // n=3 with one excluded pair is unsolvable (both derangements use a
    // forbidden edge), so use n=4 where a valid assignment still exists.
    const ids = [1, 2, 3, 4];
    for (let i = 0; i < RUNS; i++) {
      const { pairs } = runDraw(ids, [[1, 2]]);
      expect([...pairs.values()].sort()).toEqual(ids);
      expect(pairs.get(1)).not.toBe(2);
      expect(pairs.get(2)).not.toBe(1);
      for (const [g, r] of pairs) expect(g).not.toBe(r);
    }
  });
});

describe("leftoverIds", () => {
  it("returns every guest when there are no assignments", () => {
    expect(leftoverIds([1, 2, 3], [])).toEqual({
      givers: [1, 2, 3],
      receivers: [1, 2, 3],
    });
  });

  it("drops assigned givers and receivers independently", () => {
    expect(
      leftoverIds(
        [1, 2, 3, 4],
        [
          { giverId: 1, receiverId: 2 },
          { giverId: 2, receiverId: 3 },
        ],
      ),
    ).toEqual({
      givers: [3, 4],
      receivers: [1, 4],
    });
  });

  it("returns empty lists when every guest already gives and receives", () => {
    expect(
      leftoverIds(
        [1, 2],
        [
          { giverId: 1, receiverId: 2 },
          { giverId: 2, receiverId: 1 },
        ],
      ),
    ).toEqual({ givers: [], receivers: [] });
  });
});

describe("drawReadiness", () => {
  it("allows a leftover pair and blocks a lone self-draw", () => {
    expect(
      drawReadiness({
        guestCount: 4,
        leftoverGivers: 2,
        leftoverReceivers: 2,
        disallowSelfDraw: true,
      }),
    ).toEqual({ everyoneGives: false, canDrawRemaining: true });
    expect(
      drawReadiness({
        guestCount: 3,
        leftoverGivers: 1,
        leftoverReceivers: 1,
        leftoverGiverId: 3,
        leftoverReceiverId: 3,
        disallowSelfDraw: true,
      }),
    ).toEqual({ everyoneGives: false, canDrawRemaining: false });
  });
});

describe("runDraw Hall violation", () => {
  it("throws when everyone has a candidate but no perfect matching exists", () => {
    expect(() => runDraw([1, 2, 3], [[1, 2]])).toThrow(/relaxing exclusions/);
  });

  it("drops a history layer before giving up", () => {
    expect(() =>
      runDraw([1, 2, 3], [[1, 2]], [[[1, 3]]]),
    ).toThrow(/relaxing exclusions/);
  });
});

describe("possibleRecipientsByGiver", () => {
  it("lists everyone except self when self-draw is off", () => {
    const map = possibleRecipientsByGiver([1, 2, 3], [1, 2, 3]);
    expect(map.get(1)).toEqual([2, 3]);
    expect(map.get(2)).toEqual([1, 3]);
    expect(map.get(3)).toEqual([1, 2]);
  });

  it("forbids an exclusion in both directions", () => {
    const map = possibleRecipientsByGiver([1, 2, 3], [1, 2, 3], [[1, 2]]);
    expect(map.get(1)).toEqual([3]);
    expect(map.get(2)).toEqual([3]);
    expect(map.get(3)).toEqual([1, 2]);
  });

  it("uses leftover giver and receiver lists independently", () => {
    const map = possibleRecipientsByGiver([3, 4], [1, 4]);
    expect(map.get(3)).toEqual([1, 4]);
    expect(map.get(4)).toEqual([1]);
  });

  it("includes self when self-draw is on", () => {
    const map = possibleRecipientsByGiver([3, 4], [1, 4], [], {
      allowSelfDraw: true,
    });
    expect(map.get(3)).toEqual([1, 4]);
    expect(map.get(4)).toEqual([1, 4]);
  });

  it("honours a self-exclusion even when self-draw is on", () => {
    const map = possibleRecipientsByGiver([1, 2], [1, 2], [[1, 1]], {
      allowSelfDraw: true,
    });
    expect(map.get(1)).toEqual([2]);
    expect(map.get(2)).toEqual([1, 2]);
  });

  it("returns an empty list when a leftover giver has no allowed receiver", () => {
    const map = possibleRecipientsByGiver([1], [3], [[1, 3]]);
    expect(map.get(1)).toEqual([]);
  });

  it("excludes directed past pairings without blocking the reverse direction", () => {
    const map = possibleRecipientsByGiver([1, 2, 3], [1, 2, 3], [], {
      pastPairings: [[1, 2]],
    });
    expect(map.get(1)).toEqual([3]);
    expect(map.get(2)).toEqual([1, 3]);
    expect(map.get(3)).toEqual([1, 2]);
  });
});

describe("hasPastPairing", () => {
  it("matches only the exact directed giver->receiver pair", () => {
    const past: Array<[number, number]> = [
      [1, 2],
      [2, 3],
    ];
    expect(hasPastPairing(past, 1, 2)).toBe(true);
    expect(hasPastPairing(past, 1, 3)).toBe(false);
    expect(hasPastPairing(past, 2, 1)).toBe(false);
    expect(hasPastPairing(past, 3, 1)).toBe(false);
  });
});
