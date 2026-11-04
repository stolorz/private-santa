import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
  makeWishlistItem,
} from "@/test/helpers/fixtures";
import { nameCases } from "@/lib/name-cases";

const notifyAdminsOfGuestActivity = vi.hoisted(() =>
  vi.fn(async () => undefined),
);

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/push", () => ({
  notifyAdminsOfGuestActivity,
}));

import {
  guestLinkByToken,
  loadRevealedMatch,
  markGuestLinkOpened,
  markGuestLinkRevealed,
  markMatchWishlistSeen,
} from "@/lib/guest-link";

function seedPair(token = "abc") {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
  mockDb.seed(schema.draw, [makeDraw()]);
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 1, personId: 1 }),
    makeGuest({ id: 2, personId: 2 }),
  ]);
  mockDb.seed(schema.assignment, [
    makeAssignment({
      id: 1,
      giverId: 1,
      receiverId: 2,
      revealToken: token,
    }),
  ]);
}

describe("guestLinkByToken", () => {
  it("returns null for an unknown token", async () => {
    seedPair();
    await expect(guestLinkByToken("")).resolves.toBeNull();
    await expect(guestLinkByToken("missing")).resolves.toBeNull();
  });

  it("resolves giver, receiver and draw", async () => {
    seedPair("secret");
    await expect(guestLinkByToken("secret")).resolves.toMatchObject({
      giver: { id: 1, name: "Ada" },
      receiver: { id: 2, name: "Bea" },
      assignment: { revealToken: "secret" },
      draw: { id: 1 },
    });
  });
});

describe("guest link activity", () => {
  beforeEach(() => {
    notifyAdminsOfGuestActivity.mockClear();
  });

describe("markGuestLinkOpened", () => {
  it("returns null for an unknown token", async () => {
    seedPair();
    await expect(markGuestLinkOpened("missing")).resolves.toBeNull();
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("records the first open and leaves later pings unchanged", async () => {
    seedPair("secret");

    const first = await markGuestLinkOpened("secret");
    expect(first?.assignment.openedAt).toBeInstanceOf(Date);
    expect(mockDb.rows(schema.assignment)[0]?.openedAt).toBeInstanceOf(Date);
    expect(mockDb.rows(schema.assignment)[0]?.revealCount).toBe(0);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "opened",
      giver: nameCases("Ada"),
      eventId: 1,
    });

    const again = await markGuestLinkOpened("secret");
    expect(again?.assignment.openedAt).toEqual(first?.assignment.openedAt);
    expect(mockDb.updates).toHaveLength(2);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(mockDb.rows(schema.guestActivity)).toHaveLength(2);
    expect(mockDb.rows(schema.guestActivity).map((r) => r.kind)).toEqual([
      "opened",
      "opened",
    ]);
  });

  it("does not clear a wishlist notice claim on the wrapped page", async () => {
    seedPair("secret");
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "secret",
        wishlistNotifyClaim: "claim-token",
      }),
    ]);

    await markGuestLinkOpened("secret");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      "claim-token",
    );
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toBeNull();
  });

  it("stores ip and browser debug fields on each visit", async () => {
    seedPair("secret");
    await markGuestLinkOpened("secret", {
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0 Firefox/131.0",
      browser: "Firefox 131",
      os: "Windows",
    });
    expect(mockDb.rows(schema.guestActivity)[0]).toMatchObject({
      assignmentId: 1,
      kind: "opened",
      ip: "203.0.113.9",
      browser: "Firefox 131",
      os: "Windows",
    });
  });
});

describe("markGuestLinkRevealed", () => {
  it("returns null for an unknown token", async () => {
    seedPair();
    await expect(markGuestLinkRevealed("missing")).resolves.toBeNull();
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("records the first unwrap and leaves later visits unchanged", async () => {
    seedPair("secret");

    const first = await markGuestLinkRevealed("secret");
    expect(first?.assignment.revealCount).toBe(1);
    expect(first?.assignment.openedAt).toBeInstanceOf(Date);
    expect(mockDb.rows(schema.assignment)[0]?.revealCount).toBe(1);
    expect(mockDb.rows(schema.assignment)[0]?.openedAt).toBeInstanceOf(Date);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "revealed",
      giver: nameCases("Ada"),
      eventId: 1,
    });
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toBeInstanceOf(
      Date,
    );
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();

    const again = await markGuestLinkRevealed("secret");
    expect(again?.assignment.revealCount).toBe(1);
    expect(mockDb.updates).toHaveLength(3);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(mockDb.rows(schema.guestActivity).map((r) => r.kind)).toEqual([
      "revealed",
      "revealed",
    ]);
  });

  it("clears a wishlist notice claim on the first unwrap", async () => {
    seedPair("secret");
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "secret",
        wishlistNotifyClaim: "claim-token",
      }),
    ]);

    await markGuestLinkRevealed("secret");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toBeInstanceOf(
      Date,
    );
  });

  it("sends wishlist_read with revealed when the match list already changed", async () => {
    seedPair("secret");
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({
        id: 2,
        personId: 2,
        wishlistUpdatedAt: new Date("2026-12-01T10:00:00.000Z"),
      }),
    ]);

    await markGuestLinkRevealed("secret");

    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(2);
    expect(notifyAdminsOfGuestActivity).toHaveBeenNthCalledWith(1, {
      kind: "revealed",
      giver: nameCases("Ada"),
      eventId: 1,
    });
    expect(notifyAdminsOfGuestActivity).toHaveBeenNthCalledWith(2, {
      kind: "wishlist_read",
      giver: nameCases("Ada"),
      eventId: 1,
    });
  });

  it("keeps an existing openedAt when unwrapping", async () => {
    const openedAt = new Date("2026-12-01T10:00:00.000Z");
    seedPair("secret");
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "secret",
        openedAt,
      }),
    ]);

    const first = await markGuestLinkRevealed("secret");
    expect(first?.assignment.revealCount).toBe(1);
    expect(first?.assignment.openedAt).toEqual(openedAt);
    expect(mockDb.rows(schema.assignment)[0]?.openedAt).toEqual(openedAt);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "revealed",
      giver: nameCases("Ada"),
      eventId: 1,
    });
  });
});

describe("markMatchWishlistSeen", () => {
  it("does nothing until the match is unwrapped", async () => {
    seedPair("secret");
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({
        id: 2,
        personId: 2,
        wishlistUpdatedAt: new Date("2026-12-01T10:00:00.000Z"),
      }),
    ]);

    await markMatchWishlistSeen("secret");

    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toBeNull();
  });

  it("notifies once after a later change, then a repeat ping is a no-op", async () => {
    seedPair("secret");
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({
        id: 2,
        personId: 2,
        wishlistUpdatedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "secret",
        revealCount: 1,
        openedAt: new Date("2026-01-01T00:00:00.000Z"),
        wishlistSeenAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    await markMatchWishlistSeen("secret");
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "wishlist_read",
      giver: nameCases("Ada"),
      eventId: 1,
    });
    const afterChange = mockDb.rows(schema.assignment)[0]?.wishlistSeenAt;
    expect(afterChange?.getTime()).toBeGreaterThan(
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );

    await markMatchWishlistSeen("secret");
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toEqual(
      afterChange,
    );
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
  });

  it("clears a wishlist notice claim when the list is caught up", async () => {
    seedPair("secret");
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "secret",
        revealCount: 1,
        openedAt: new Date("2026-01-01T00:00:00.000Z"),
        wishlistSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        wishlistNotifyClaim: "claim-token",
      }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({
        id: 2,
        personId: 2,
        wishlistUpdatedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ]);

    await markMatchWishlistSeen("secret");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
  });
});

});

describe("loadRevealedMatch", () => {
  it("returns the receiver name, photo and wishlist only", async () => {
    seedPair("secret");
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 1, guestId: 1, text: "Mine" }),
      makeWishlistItem({
        id: 2,
        guestId: 2,
        text: "A book",
      }),
    ]);

    const link = await guestLinkByToken("secret");
    await expect(loadRevealedMatch(link!)).resolves.toEqual({
      ...nameCases("Bea"),
      photo: null,
      wishlist: [{ id: 2, text: "A book" }],
    });
  });

  it("includes the receiver's name cases", async () => {
    seedPair("secret");
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({
        id: 2,
        name: "Bea",
        nameDopelniacz: "Bei",
        nameWolacz: "Beo",
      }),
    ]);

    const link = await guestLinkByToken("secret");
    await expect(loadRevealedMatch(link!)).resolves.toMatchObject({
      name: "Bea",
      nameDopelniacz: "Bei",
      nameWolacz: "Beo",
    });
  });
});
