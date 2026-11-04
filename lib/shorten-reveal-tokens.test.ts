import { afterEach, describe, expect, it, vi } from "vitest";
import * as ids from "@/lib/ids";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeAssignment } from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { shortenRevealTokens } from "@/lib/shorten-reveal-tokens";

const OPENED = new Date("2026-03-01T12:00:00.000Z");
const LONG = "keohlxgwh7ys";
const HEX =
  "f294cb874772ba2a854bf474005743ecb32068847e4f9c79";

describe("shortenRevealTokens", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when there are no assignments", () => {
    expect(shortenRevealTokens()).toBe(0);
  });

  it("replaces tokens that are not a safe 6-character id and leaves the rest", () => {
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "kept01",
        revealCount: 4,
        openedAt: OPENED,
      }),
      makeAssignment({
        id: 2,
        drawId: 1,
        giverId: 2,
        receiverId: 3,
        revealToken: LONG,
        revealCount: 2,
        openedAt: OPENED,
      }),
      makeAssignment({
        id: 3,
        drawId: 1,
        giverId: 3,
        receiverId: 4,
        revealToken: HEX,
        revealCount: 1,
      }),
      makeAssignment({
        id: 4,
        drawId: 1,
        giverId: 4,
        receiverId: 1,
        revealToken: "signup",
        revealCount: 7,
      }),
    ]);

    expect(shortenRevealTokens()).toBe(3);

    const rows = mockDb.rows(schema.assignment);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(1)?.revealToken).toBe("kept01");
    expect(byId.get(1)?.revealCount).toBe(4);
    expect(byId.get(1)?.openedAt).toEqual(OPENED);
    for (const id of [2, 3, 4]) {
      const token = byId.get(id)?.revealToken ?? "";
      expect(token).toMatch(/^[0-9a-z]{6}$/);
      expect(ids.isReservedFirstSegment(token)).toBe(false);
      expect(token).not.toBe("kept01");
    }
    expect(byId.get(2)?.revealCount).toBe(2);
    expect(byId.get(2)?.openedAt).toEqual(OPENED);
    expect(byId.get(3)?.revealCount).toBe(1);
    expect(byId.get(4)?.revealCount).toBe(7);
    expect(new Set(rows.map((row) => row.revealToken)).size).toBe(4);

    const tokens = rows.map((row) => row.revealToken).sort();
    expect(shortenRevealTokens()).toBe(0);
    expect(mockDb.rows(schema.assignment).map((row) => row.revealToken).sort()).toEqual(
      tokens,
    );
  });

  it("skips a draw that collides with a token already in use", () => {
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "kept01",
      }),
      makeAssignment({
        id: 2,
        drawId: 1,
        giverId: 2,
        receiverId: 1,
        revealToken: LONG,
      }),
    ]);
    const spy = vi
      .spyOn(ids, "revealToken")
      .mockReturnValueOnce("kept01")
      .mockReturnValueOnce("short2");

    expect(shortenRevealTokens()).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(mockDb.rows(schema.assignment).find((row) => row.id === 1)?.revealToken).toBe(
      "kept01",
    );
    expect(mockDb.rows(schema.assignment).find((row) => row.id === 2)?.revealToken).toBe(
      "short2",
    );
  });

  it("rolls back when a replacement token cannot be allocated", () => {
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "kept01",
      }),
      makeAssignment({
        id: 2,
        drawId: 1,
        giverId: 2,
        receiverId: 3,
        revealToken: LONG,
      }),
      makeAssignment({
        id: 3,
        drawId: 1,
        giverId: 3,
        receiverId: 1,
        revealToken: HEX,
      }),
    ]);
    vi.spyOn(ids, "revealToken")
      .mockReturnValueOnce("newok1")
      .mockReturnValue("kept01");

    expect(() => shortenRevealTokens()).toThrow(
      "Could not allocate a reveal token.",
    );
    const tokens = new Map(
      mockDb.rows(schema.assignment).map((row) => [row.id, row.revealToken]),
    );
    expect(tokens.get(1)).toBe("kept01");
    expect(tokens.get(2)).toBe(LONG);
    expect(tokens.get(3)).toBe(HEX);
  });
});
