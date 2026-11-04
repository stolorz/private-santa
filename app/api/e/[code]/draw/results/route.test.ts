import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeAssignment,
  makeDraw,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams, emptyRequest } from "@/test/helpers/request";
import { asAdmin, asAnonymous, asUser } from "@/test/helpers/session";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { GET } from "./route";

async function csvBytes(res: Response): Promise<string> {
  return Buffer.from(await res.arrayBuffer()).toString("utf8");
}

function seedEdition() {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
}

describe("GET /api/e/[code]/draw/results", () => {
  beforeEach(async () => {
    await asAdmin();
    seedEdition();
  });

  it("returns 401 when the caller is anonymous", async () => {
    await asAnonymous();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw/results`),
      codeParams(),
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the caller is signed in but not an admin", async () => {
    await asUser();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw/results`),
      codeParams(),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns 404 for an unknown event", async () => {
    const res = await GET(
      emptyRequest("/api/e/missing/draw/results"),
      codeParams("missing"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Unknown event." });
  });

  it("returns 404 when the edition has no draw", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw/results`),
      codeParams(),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "No draw yet." });
  });

  it("downloads the current pairs as CSV", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: 'Ada, "A."' }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cora" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
      makeGuest({ id: 3, personId: 3 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 2,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 3,
        receiverId: 1,
      }),
      makeAssignment({
        id: 2,
        drawId: 2,
        giverId: 2,
        receiverId: 1,
      }),
      makeAssignment({
        id: 3,
        drawId: 2,
        giverId: 1,
        receiverId: 2,
      }),
    ]);

    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw/results`),
      codeParams(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="draw_results_2026.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await csvBytes(res);
    expect(body).toBe(
      '\uFEFFgiver,receiver\r\n"Ada, ""A.""",Bea\r\nBea,"Ada, ""A."""\r\n',
    );
    expect(body).not.toContain("Cora");
  });

  it("uses a yearless file name when the party date is not a real day", async () => {
    mockDb.reset();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2026-02-31" })]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [makeDraw()]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ giverId: 1, receiverId: 2 }),
    ]);

    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw/results`),
      codeParams(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="draw_results.csv"',
    );
    expect(await csvBytes(res)).toBe("\uFEFFgiver,receiver\r\nAda,Bea\r\n");
  });
});
