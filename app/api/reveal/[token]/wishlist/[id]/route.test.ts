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
import { jsonRequest, tokenParams } from "@/test/helpers/request";
import { WISHLIST_CLOSED_MESSAGE } from "@/lib/wishlist";

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

import { DELETE, PATCH } from "./route";

const TOKEN = "guest-token";

describe("DELETE /api/reveal/[token]/wishlist/[id]", () => {
  beforeEach(() => {
    notifyAdminsOfGuestActivity.mockClear();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2099-12-24" })]);
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
        giverId: 1,
        receiverId: 2,
        revealToken: TOKEN,
      }),
    ]);
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 10, guestId: 1, text: "Mine" }),
      makeWishlistItem({ id: 20, guestId: 2, text: "Theirs" }),
    ]);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await DELETE(
      jsonRequest("/api/reveal/nope/wishlist/10", {}, { method: "DELETE" }),
      tokenParams("nope", { id: "10" }),
    );
    expect(res.status).toBe(404);
    expect(mockDb.rows(schema.wishlistItem)).toHaveLength(2);
  });

  it("only deletes the giver's items", async () => {
    const other = await DELETE(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/20", {}, { method: "DELETE" }),
      tokenParams(TOKEN, { id: "20" }),
    );
    expect(other.status).toBe(200);
    expect(mockDb.rows(schema.wishlistItem).map((r) => r.id).sort()).toEqual([
      10, 20,
    ]);
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeNull();
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();

    const own = await DELETE(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/10", {}, { method: "DELETE" }),
      tokenParams(TOKEN, { id: "10" }),
    );
    expect(own.status).toBe(200);
    expect(mockDb.rows(schema.wishlistItem).map((r) => r.id)).toEqual([20]);
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeInstanceOf(
      Date,
    );
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("refuses to delete after the event date", async () => {
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2000-01-01" })]);
    const res = await DELETE(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/10", {}, { method: "DELETE" }),
      tokenParams(TOKEN, { id: "10" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: WISHLIST_CLOSED_MESSAGE,
    });
    expect(mockDb.rows(schema.wishlistItem).map((r) => r.id).sort()).toEqual([
      10, 20,
    ]);
  });
});

describe("PATCH /api/reveal/[token]/wishlist/[id]", () => {
  beforeEach(() => {
    notifyAdminsOfGuestActivity.mockClear();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2099-12-24" })]);
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
        giverId: 1,
        receiverId: 2,
        revealToken: TOKEN,
      }),
    ]);
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 10, guestId: 1, text: "A scarf" }),
    ]);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await PATCH(
      jsonRequest("/api/reveal/nope/wishlist/10", { text: "A hat" }, {
        method: "PATCH",
      }),
      tokenParams("nope", { id: "10" }),
    );
    expect(res.status).toBe(404);
    expect(mockDb.rows(schema.wishlistItem)[0]?.text).toBe("A scarf");
  });

  it("returns 400 when the text is empty", async () => {
    const res = await PATCH(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/10", { text: "" }, {
        method: "PATCH",
      }),
      tokenParams(TOKEN, { id: "10" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid wishlist item.",
    });
  });

  it("returns 404 for a missing or someone else's wish", async () => {
    const missing = await PATCH(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/99", { text: "A hat" }, {
        method: "PATCH",
      }),
      tokenParams(TOKEN, { id: "99" }),
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: "This wish was not found.",
    });

    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 10, guestId: 1, text: "A scarf" }),
      makeWishlistItem({ id: 20, guestId: 2, text: "Theirs" }),
    ]);
    const other = await PATCH(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/20", { text: "Nope" }, {
        method: "PATCH",
      }),
      tokenParams(TOKEN, { id: "20" }),
    );
    expect(other.status).toBe(404);
    expect(mockDb.rows(schema.wishlistItem).find((row) => row.id === 20)?.text).toBe(
      "Theirs",
    );
  });

  it("returns the row without bumping when the text is unchanged", async () => {
    const res = await PATCH(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/10", { text: "A scarf" }, {
        method: "PATCH",
      }),
      tokenParams(TOKEN, { id: "10" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 10,
      text: "A scarf",
    });
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeNull();
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("updates the text, bumps the clock, and does not ping admins", async () => {
    const res = await PATCH(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/10", { text: "Warm gloves" }, {
        method: "PATCH",
      }),
      tokenParams(TOKEN, { id: "10" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 10,
      text: "Warm gloves",
    });
    expect(mockDb.rows(schema.wishlistItem)[0]?.text).toBe("Warm gloves");
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeInstanceOf(
      Date,
    );
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("refuses to edit after the event date", async () => {
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2000-01-01" })]);
    const res = await PATCH(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist/10", { text: "Warm gloves" }, {
        method: "PATCH",
      }),
      tokenParams(TOKEN, { id: "10" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: WISHLIST_CLOSED_MESSAGE,
    });
    expect(mockDb.rows(schema.wishlistItem)[0]?.text).toBe("A scarf");
  });
});
