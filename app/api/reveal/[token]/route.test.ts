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
import { tokenParams } from "@/test/helpers/request";
import { nameCases } from "@/lib/name-cases";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import * as rateLimit from "@/lib/rate-limit";
import { POST } from "./route";

const TOKEN = "guest-token";

function seedPair(revealCount = 0) {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
  mockDb.seed(schema.draw, [makeDraw()]);
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea", photo: "bea.jpg" }),
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
      revealCount,
    }),
  ]);
}

describe("POST /api/reveal/[token]", () => {
  beforeEach(() => {
    seedPair();
  });

  it("returns 429 when the guest limiter blocks, before looking up the token", async () => {
    vi.spyOn(rateLimit, "consumeRateLimit").mockReturnValue({
      ok: false,
      retryAfterSec: 9,
    });
    const res = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
      tokenParams(TOKEN),
    );
    expect(res.status).toBe(429);
    expect(mockDb.rows(schema.assignment)[0]?.revealCount).toBe(0);
  });

  it("returns 404 for an unknown token", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/reveal/nope", { method: "POST" }),
      tokenParams("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("unwraps the match and persists so later visits stay revealed", async () => {
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 1, guestId: 1, text: "Mine" }),
      makeWishlistItem({ id: 2, guestId: 2, text: "Socks" }),
    ]);

    const first = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      match: {
        ...nameCases("Bea"),
        photo: "bea.jpg",
        wishlist: [{ id: 2, text: "Socks" }],
      },
    });
    expect(mockDb.rows(schema.assignment)[0]?.revealCount).toBe(1);
    expect(mockDb.rows(schema.assignment)[0]?.openedAt).toBeInstanceOf(Date);
    expect(mockDb.rows(schema.guestActivity)[0]).toMatchObject({
      kind: "revealed",
      assignmentId: 1,
    });

    const again = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );
    expect(again.status).toBe(200);
    expect(mockDb.rows(schema.assignment)[0]?.revealCount).toBe(1);
    expect(mockDb.rows(schema.guestActivity)).toHaveLength(2);
  });

  it("does not leak the receiver's contact details", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({
        id: 2,
        name: "Bea",
        phone: "351911111111",
        email: "bea@example.com",
      }),
    ]);

    const res = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("351911111111");
    expect(JSON.stringify(body)).not.toContain("bea@example.com");
  });
});
