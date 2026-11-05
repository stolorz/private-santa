import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import {
  historyPairsForDraw,
  listPastPairings,
  pastPairingLayers,
} from "@/lib/draw-history";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";

describe("historyPairsForDraw", () => {
  // Newest first — the contract `pastPairingLayers` uses (`occursOn` desc).
  const recentDraws = [{ id: 4 }, { id: 3 }, { id: 2 }, { id: 1 }];
  const assignments = [
    { drawId: 4, giverId: 1, receiverId: 2 },
    { drawId: 3, giverId: 2, receiverId: 3 },
    { drawId: 2, giverId: 3, receiverId: 1 },
    { drawId: 1, giverId: 1, receiverId: 3 },
    { drawId: 4, giverId: 2, receiverId: 1 },
  ];

  it("returns empty when recentDraws is empty", () => {
    expect(historyPairsForDraw(1, [], assignments)).toEqual([]);
  });

  it("skips the current draw and returns the rest oldest first", () => {
    expect(historyPairsForDraw(4, recentDraws, assignments)).toEqual([
      [[1, 3]],
      [[3, 1]],
      [[2, 3]],
    ]);
  });

  it("maps matching assignments to [giverId, receiverId] in assignment order within a layer", () => {
    expect(
      historyPairsForDraw(4, [{ id: 4 }, { id: 3 }], assignments),
    ).toEqual([[[2, 3]]]);
  });

  it("includes every assignment from the selected draws, not just the first", () => {
    const withExtra = [
      ...assignments,
      { drawId: 3, giverId: 1, receiverId: 3 },
    ];
    expect(
      historyPairsForDraw(4, [{ id: 4 }, { id: 3 }], withExtra),
    ).toEqual([
      [
        [2, 3],
        [1, 3],
      ],
    ]);
  });

  it("returns empty when every remaining draw is the current one", () => {
    expect(
      historyPairsForDraw(9, [{ id: 9 }], [
        { drawId: 9, giverId: 1, receiverId: 2 },
      ]),
    ).toEqual([]);
  });

  it("treats recentDraws as newest-first and reverses for the solver", () => {
    expect(historyPairsForDraw(4, recentDraws, assignments)).toEqual([
      [[1, 3]],
      [[3, 1]],
      [[2, 3]],
    ]);
  });

  it("skips selected draws that have no assignments", () => {
    expect(
      historyPairsForDraw(
        4,
        [{ id: 4 }, { id: 3 }, { id: 99 }],
        [{ drawId: 3, giverId: 2, receiverId: 3 }],
      ),
    ).toEqual([[[2, 3]]]);
  });
});

describe("pastPairingLayers", () => {
  it("dedupes assignments from the same past draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
      makeEvent({ id: 2, occursOn: "2026-12-24" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1 }),
      makePerson({ id: 2 }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
      makeGuest({ id: 20, eventId: 2, personId: 1 }),
      makeGuest({ id: 21, eventId: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, eventId: 1, status: "completed" }),
      makeDraw({ id: 2, eventId: 2, status: "completed" }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 11,
        revealToken: "pasttokenaaa",
      }),
      makeAssignment({
        id: 2,
        drawId: 1,
        giverId: 11,
        receiverId: 10,
        revealToken: "pasttokenbbb",
      }),
    ]);
    const layers = pastPairingLayers(mockDb.db, makeEvent({ id: 2, occursOn: "2026-12-24" }), 2);
    expect(layers).toHaveLength(1);
    expect(layers[0]?.map((pair) => pair.join("->")).sort()).toEqual([
      "20->21",
      "21->20",
    ]);
    const flat = await listPastPairings(
      makeEvent({ id: 2, occursOn: "2026-12-24" }),
    );
    expect(flat.map((pair) => pair.join("->")).sort()).toEqual([
      "20->21",
      "21->20",
    ]);
  });
});
