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
} from "@/test/helpers/fixtures";
import { tokenParams } from "@/test/helpers/request";
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

import { POST } from "./route";

const TOKEN = "guest-token";

function seedPair(overrides: {
  revealCount?: number;
  wishlistUpdatedAt?: Date | null;
  wishlistSeenAt?: Date | null;
} = {}) {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
  mockDb.seed(schema.draw, [makeDraw()]);
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 1, personId: 1 }),
    makeGuest({
      id: 2,
      personId: 2,
      wishlistUpdatedAt: overrides.wishlistUpdatedAt ?? null,
    }),
  ]);
  mockDb.seed(schema.assignment, [
    makeAssignment({
      giverId: 1,
      receiverId: 2,
      revealToken: TOKEN,
      revealCount: overrides.revealCount ?? 0,
      wishlistSeenAt: overrides.wishlistSeenAt ?? null,
    }),
  ]);
}

describe("POST /api/reveal/[token]/wishlist-seen", () => {
  beforeEach(() => {
    notifyAdminsOfGuestActivity.mockClear();
  });

  it("returns 404 for an unknown token", async () => {
    seedPair();
    const res = await POST(
      new NextRequest("http://localhost/api/reveal/nope/wishlist-seen", {
        method: "POST",
      }),
      tokenParams("nope"),
    );
    expect(res.status).toBe(404);
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("is a no-op until the match is unwrapped", async () => {
    seedPair({
      wishlistUpdatedAt: new Date("2026-12-01T10:00:00.000Z"),
    });

    const res = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/wishlist-seen`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toBeNull();
    expect(notifyAdminsOfGuestActivity).not.toHaveBeenCalled();
  });

  it("notifies once after the match list changes, then ignores a repeat ping", async () => {
    const updatedAt = new Date("2026-01-02T10:00:00.000Z");
    const seenAt = new Date("2026-01-01T10:00:00.000Z");
    seedPair({
      revealCount: 1,
      wishlistUpdatedAt: updatedAt,
      wishlistSeenAt: seenAt,
    });

    const first = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/wishlist-seen`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );
    expect(first.status).toBe(200);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledWith({
      kind: "wishlist_read",
      giver: nameCases("Ada"),
      eventId: 1,
    });
    const afterFirst = mockDb.rows(schema.assignment)[0]?.wishlistSeenAt;
    expect(afterFirst).toBeInstanceOf(Date);
    expect(afterFirst?.getTime()).toBeGreaterThan(seenAt.getTime());

    const again = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/wishlist-seen`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );
    expect(again.status).toBe(200);
    expect(notifyAdminsOfGuestActivity).toHaveBeenCalledTimes(1);
    expect(mockDb.rows(schema.assignment)[0]?.wishlistSeenAt).toEqual(
      afterFirst,
    );
  });
});
