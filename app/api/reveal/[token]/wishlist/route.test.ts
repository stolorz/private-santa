import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
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
import { nameCases } from "@/lib/name-cases";
import { WISHLIST_CLOSED_MESSAGE } from "@/lib/wishlist";

const notifyAdminsOfGuestActivity = vi.hoisted(() =>
  vi.fn(async (_payload: unknown) => undefined),
);

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/push", () => ({
  notifyAdminsOfGuestActivity,
}));

import { GET, POST } from "./route";

const TOKEN = "guest-token";

function seedPair() {
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
}

describe("/api/reveal/[token]/wishlist", () => {
  beforeEach(() => {
    notifyAdminsOfGuestActivity.mockClear();
    seedPair();
  });

  it("returns 404 for an unknown token", async () => {
    const res = await POST(
      jsonRequest("/api/reveal/nope/wishlist", { text: "A book" }),
      tokenParams("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("lists the giver's wishlist items", async () => {
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 1, guestId: 1, text: "Mine" }),
      makeWishlistItem({ id: 2, guestId: 2, text: "Theirs" }),
    ]);

    const res = await GET(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/wishlist`),
      tokenParams(TOKEN),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ id: 1, text: "Mine" }),
    ]);
  });

  it("creates a wishlist item for the giver, not the receiver", async () => {
    const res = await POST(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist", { text: "A book" }),
      tokenParams(TOKEN),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      guestId: 1,
      text: "A book",
    });
    expect(mockDb.rows(schema.guest)[0]?.wishlistUpdatedAt).toBeInstanceOf(
      Date,
    );
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "wishlist_added",
      giver: nameCases("Ada"),
      eventId: 1,
    });
    expect(JSON.stringify(notifyAdminsOfGuestActivity.mock.calls.at(0)?.[0])).not.toContain(
      "A book",
    );
  });

  it("stores only the item text", async () => {
    const res = await POST(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist", {
        text: "A book",
        url: "https://example.com/book",
      }),
      tokenParams(TOKEN),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ guestId: 1, text: "A book" });
    expect(body).not.toHaveProperty("url");
    expect(mockDb.rows(schema.wishlistItem)[0]).toMatchObject({
      guestId: 1,
      text: "A book",
    });
    expect(mockDb.rows(schema.wishlistItem)[0]).not.toHaveProperty("url");
  });

  it("refuses to add an item after the event date and still lists the list", async () => {
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2000-01-01" })]);
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 1, guestId: 1, text: "Mine" }),
    ]);
    const added = await POST(
      jsonRequest("/api/reveal/" + TOKEN + "/wishlist", { text: "A book" }),
      tokenParams(TOKEN),
    );
    expect(added.status).toBe(400);
    await expect(added.json()).resolves.toEqual({
      error: WISHLIST_CLOSED_MESSAGE,
    });
    expect(mockDb.rows(schema.wishlistItem)).toHaveLength(1);

    const listed = await GET(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/wishlist`),
      tokenParams(TOKEN),
    );
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual([
      expect.objectContaining({ id: 1, text: "Mine" }),
    ]);
  });
});
