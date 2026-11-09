import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { first as realFirst, mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
  makeWishlistItem,
} from "@/test/helpers/fixtures";
import { nameCases } from "@/lib/name-cases";

const notifyAdminsOfGuestActivity = vi.hoisted(() =>
  vi.fn(async (_payload: unknown) => undefined),
);
const notifyGiverOfWishlistChange = vi.hoisted(() =>
  vi.fn(async () => undefined),
);

vi.mock("@/lib/db", async () => {
  const { mockLibDb, first } = await import("@/test/helpers/db");
  const lib = await mockLibDb();
  return { ...lib, first: vi.fn(first) };
});

vi.mock("@/lib/push", () => ({
  notifyAdminsOfGuestActivity,
}));

vi.mock("@/lib/wishlist-notify", () => ({
  notifyGiverOfWishlistChange,
}));

import { first } from "@/lib/db";
import {
  addWishlistItem,
  deleteOwnedWishlistItem,
  listWishlistItems,
  recordWishlistChange,
  updateOwnedWishlistItem,
  WISHLIST_CLOSED_MESSAGE,
  wishlistItemCounts,
} from "@/lib/wishlist";

describe("recordWishlistChange", () => {
  beforeEach(() => {
    notifyAdminsOfGuestActivity.mockClear();
    notifyGiverOfWishlistChange.mockClear();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
  });

  it("bumps wishlistUpdatedAt and notifies on add without item text", async () => {
    await recordWishlistChange(1, { kind: "added" });

    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeInstanceOf(
      Date,
    );
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "wishlist_added",
      giver: nameCases("Ada"),
      eventId: 1,
    });
    expect(JSON.stringify(notifyAdminsOfGuestActivity.mock.calls.at(0)?.[0])).not.toMatch(
      /http|book|socks|text|url/i,
    );
    expect(notifyGiverOfWishlistChange).toHaveBeenCalledWith(1, "added");
  });

  it("counts items per guest and skips an empty id list", async () => {
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 1, guestId: 1, text: "A" }),
      makeWishlistItem({ id: 2, guestId: 1, text: "B" }),
      makeWishlistItem({ id: 3, guestId: 2, text: "C" }),
    ]);

    await expect(wishlistItemCounts([])).resolves.toEqual(new Map());
    await expect(wishlistItemCounts([1, 2, 9])).resolves.toEqual(
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
  });

  it("skips the admin ping when the guest seat is gone", async () => {
    await recordWishlistChange(9, { kind: "added" });
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("bumps wishlistUpdatedAt on delete without notifying", async () => {
    await recordWishlistChange(1, { kind: "removed" });

    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeInstanceOf(
      Date,
    );
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
    expect(notifyGiverOfWishlistChange).toHaveBeenCalledWith(1, "removed");
  });

  it("bumps the clock on edit without an organiser ping", async () => {
    await recordWishlistChange(1, { kind: "changed" });
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeInstanceOf(
      Date,
    );
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
    expect(notifyGiverOfWishlistChange).toHaveBeenCalledWith(1, "changed");
  });
});

describe("updateOwnedWishlistItem", () => {
  beforeEach(() => {
    vi.mocked(first).mockReset();
    vi.mocked(first).mockImplementation(realFirst);
    notifyAdminsOfGuestActivity.mockClear();
    notifyGiverOfWishlistChange.mockClear();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2099-12-24" })]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 10, guestId: 1, text: "A scarf" }),
    ]);
  });

  it("returns the row and stays quiet when the text is unchanged", async () => {
    await expect(updateOwnedWishlistItem(1, 10, "A scarf")).resolves.toMatchObject({
      id: 10,
      text: "A scarf",
    });
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeNull();
    expect(notifyGiverOfWishlistChange).not.toHaveBeenCalled();
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("updates the text and records a changed notice", async () => {
    await expect(
      updateOwnedWishlistItem(1, 10, "Warm gloves"),
    ).resolves.toMatchObject({
      id: 10,
      text: "Warm gloves",
    });
    expect(mockDb.rows(schema.wishlistItem)[0]?.text).toBe("Warm gloves");
    expect(notifyGiverOfWishlistChange).toHaveBeenCalledWith(1, "changed");
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("throws when the wish is missing or not owned", async () => {
    await expect(updateOwnedWishlistItem(1, 99, "Nope")).rejects.toThrow(
      "This wish was not found.",
    );
    mockDb.add(
      schema.wishlistItem,
      makeWishlistItem({ id: 20, guestId: 2, text: "Theirs" }),
    );
    await expect(updateOwnedWishlistItem(1, 20, "Nope")).rejects.toThrow(
      "This wish was not found.",
    );
    expect(mockDb.rows(schema.wishlistItem).find((row) => row.id === 20)?.text).toBe(
      "Theirs",
    );
  });

  it("falls back to the owned row when the update returns nothing", async () => {
    const owned = mockDb.rows(schema.wishlistItem)[0]!;
    vi.mocked(first)
      .mockImplementationOnce(async (query) => (await query)[0])
      .mockImplementationOnce(async (query) => {
        await query;
        return undefined;
      });

    await expect(
      updateOwnedWishlistItem(1, 10, "Warm gloves"),
    ).resolves.toEqual(owned);
    expect(mockDb.rows(schema.wishlistItem)[0]?.text).toBe("Warm gloves");
    expect(notifyGiverOfWishlistChange).toHaveBeenCalledWith(1, "changed");
  });
});

describe("wishlist closed after the event date", () => {
  beforeEach(() => {
    vi.mocked(first).mockReset();
    vi.mocked(first).mockImplementation(realFirst);
    notifyAdminsOfGuestActivity.mockClear();
    notifyGiverOfWishlistChange.mockClear();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2000-01-01" })]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 10, guestId: 1, text: "A scarf" }),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses add, edit, and delete", async () => {
    await expect(addWishlistItem(1, "Warm socks")).rejects.toThrow(
      WISHLIST_CLOSED_MESSAGE,
    );
    await expect(updateOwnedWishlistItem(1, 10, "Warm gloves")).rejects.toThrow(
      WISHLIST_CLOSED_MESSAGE,
    );
    await expect(deleteOwnedWishlistItem(1, 10)).rejects.toThrow(
      WISHLIST_CLOSED_MESSAGE,
    );
    expect(mockDb.rows(schema.wishlistItem)).toHaveLength(1);
    expect(notifyGiverOfWishlistChange).not.toHaveBeenCalled();
  });

  it("skips the date check when the guest or event is missing", async () => {
    await expect(updateOwnedWishlistItem(9, 10, "Nope")).rejects.toThrow(
      "This wish was not found.",
    );
    mockDb.seed(schema.event, []);
    await expect(
      updateOwnedWishlistItem(1, 10, "Warm gloves"),
    ).resolves.toMatchObject({
      text: "Warm gloves",
    });
  });

  it("treats an invalid party date as still open", async () => {
    mockDb.seed(schema.event, [makeEvent({ occursOn: "not-a-date" })]);
    await expect(deleteOwnedWishlistItem(1, 10)).resolves.toBeUndefined();
    expect(mockDb.rows(schema.wishlistItem)).toHaveLength(0);
  });

  it("still lists items after the party date", async () => {
    await expect(listWishlistItems(1)).resolves.toEqual([
      expect.objectContaining({ id: 10, text: "A scarf" }),
    ]);
  });

  it("lets add through when the edition row is gone", async () => {
    mockDb.seed(schema.event, []);
    await expect(addWishlistItem(1, "Warm socks")).resolves.toMatchObject({
      text: "Warm socks",
    });
  });

  it("stays open on the party date itself (the next UTC day is the cut-off)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-24T23:59:59.000Z"));
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2026-12-24" })]);
    await expect(addWishlistItem(1, "Warm socks")).resolves.toMatchObject({
      text: "Warm socks",
    });
  });
});
