import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import { emptyRequest, jsonRequest } from "@/test/helpers/request";
import { asAdmin, asAnonymous, asUser } from "@/test/helpers/session";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { GET, POST } from "./route";

describe("/api/events", () => {
  beforeEach(async () => {
    await asUser({ id: "user_1" });
  });

  it("returns 401 when not logged in", async () => {
    await asAnonymous();

    const res = await GET(emptyRequest("/api/events"));

    expect(res.status).toBe(401);
  });

  it("lists no editions for a non-admin", async () => {
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent(),
      makeEvent({ id: 2, seriesId: 2, code: "office_20260101" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, userId: "user_1" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 2, personId: 1 })]);

    const res = await GET(emptyRequest("/api/events"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("lists every series for a site admin", async () => {
    await asAdmin({ id: "admin" });
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent(),
      makeEvent({ id: 2, seriesId: 2, code: "office_20260101" }),
    ]);

    const res = await GET(emptyRequest("/api/events"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((g: { series: { slug: string } }) => g.series.slug).sort()).toEqual([
      "office",
      "xmas",
    ]);
    for (const group of body) {
      for (const edition of group.editions) {
        expect(edition.problemCount).toBe(13);
      }
    }
  });

  it("returns 403 when a non-admin creates an event", async () => {
    const res = await POST(
      jsonRequest("/api/events", {
        kind: "series",
        name: "Xmas",
        occursOn: "2026-12-25",
      }),
    );

    expect(res.status).toBe(403);
  });

  it("creates an edition copying guests from the given source", async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, seriesId: 2, code: "office_20260101" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 2, personId: 1 }),
    ]);

    const res = await POST(
      jsonRequest("/api/events", {
        kind: "edition",
        seriesId: 2,
        fromCode: "office_20260101",
        name: "Office",
        occursOn: "2027-01-01",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      seriesId: 2,
      name: "Office",
      occursOn: "2027-01-01",
      code: expect.stringMatching(/^[0-9a-z]{6}$/),
    });
    const copied = mockDb
      .rows(schema.guest)
      .filter((g) => g.eventId === body.id);
    expect(copied.map((g) => g.personId)).toEqual([1]);
  });

  it("returns 404 when fromCode is unknown or in another series", async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [makeEvent()]);

    const unknown = await POST(
      jsonRequest("/api/events", {
        kind: "edition",
        seriesId: 2,
        fromCode: "nope12",
        name: "Office",
        occursOn: "2027-01-01",
      }),
    );
    expect(unknown.status).toBe(404);

    const otherSeries = await POST(
      jsonRequest("/api/events", {
        kind: "edition",
        seriesId: 2,
        fromCode: "xmas_20260101",
        name: "Office",
        occursOn: "2027-01-01",
      }),
    );
    expect(otherSeries.status).toBe(404);
  });

  it("creates an edition without copying from another edition", async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);

    const res = await POST(
      jsonRequest("/api/events", {
        kind: "edition",
        seriesId: 2,
        name: "Office",
        occursOn: "2027-01-01",
      }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      seriesId: 2,
      name: "Office",
      occursOn: "2027-01-01",
      code: expect.stringMatching(/^[0-9a-z]{6}$/),
    });
    expect(mockDb.rows(schema.guest)).toEqual([]);
  });

  it("creates a series with a first edition", async () => {
    await asAdmin();

    const res = await POST(
      jsonRequest("/api/events", {
        kind: "series",
        name: "Xmas",
        occursOn: "2026-12-25",
      }),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      series: { name: "Xmas", slug: "xmas" },
      event: {
        code: expect.stringMatching(/^[0-9a-z]{6}$/),
        name: "Xmas",
        occursOn: "2026-12-25",
      },
    });
  });
});
