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

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { POST } from "./route";

const TOKEN = "guest-token";

function seedPair() {
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
      giverId: 1,
      receiverId: 2,
      revealToken: TOKEN,
    }),
  ]);
}

describe("POST /api/reveal/[token]/open", () => {
  beforeEach(() => {
    seedPair();
  });

  it("returns 404 for an unknown token", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/reveal/nope/open", {
        method: "POST",
      }),
      tokenParams("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("persists the first open and does not return the match", async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/open`, {
        method: "POST",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        },
      }),
      tokenParams(TOKEN),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.assignment)[0]?.openedAt).toBeInstanceOf(Date);
    expect(mockDb.rows(schema.assignment)[0]?.revealCount).toBe(0);
    expect(mockDb.rows(schema.guestActivity)).toEqual([
      expect.objectContaining({
        assignmentId: 1,
        kind: "opened",
        ip: "203.0.113.9",
        browser: "Chrome 129",
        os: "macOS",
      }),
    ]);
  });

  it("is a no-op when the link was already opened", async () => {
    const openedAt = new Date("2026-12-01T10:00:00.000Z");
    mockDb.seed(schema.assignment, [
      makeAssignment({
        giverId: 1,
        receiverId: 2,
        revealToken: TOKEN,
        openedAt,
      }),
    ]);

    const res = await POST(
      new NextRequest(`http://localhost/api/reveal/${TOKEN}/open`, {
        method: "POST",
      }),
      tokenParams(TOKEN),
    );

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.assignment)[0]?.openedAt).toEqual(openedAt);
    expect(mockDb.updates).toHaveLength(1);
    expect(mockDb.rows(schema.guestActivity)).toHaveLength(1);
    expect(mockDb.rows(schema.guestActivity)[0]?.kind).toBe("opened");
  });
});
