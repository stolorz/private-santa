import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeExclusion,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams, emptyRequest, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { GET, POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


describe("GET /api/e/[code]/exclusions", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`),
      codeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns an empty list", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns exclusions for this edition", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1 }),
      makePerson({ id: 2 }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.exclusion, [makeExclusion({ aId: 1, bId: 2 })]);

    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ eventId: 1, aId: 1, bId: 2 }),
    ]);
  });
});

describe("POST /api/e/[code]/exclusions", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`, { aId: 1, bId: 2 }),
      codeParams(),
    );

    expect(res.status).toBe(401);
  });

  it("creates an exclusion between a guest and themselves", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 3 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 3, personId: 3 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`, { aId: 3, bId: 3 }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      eventId: 1,
      aId: 3,
      bId: 3,
    });
    expect(mockDb.rows(schema.exclusion)).toHaveLength(1);
  });

  it("rejects guests from different editions", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1 }),
      makePerson({ id: 2 }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 2 }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`, { aId: 1, bId: 2 }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Both people must belong to this edition.",
    });
  });

  it("rejects a pair that is already excluded, in either order", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1 }),
      makePerson({ id: 2 }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.exclusion, [makeExclusion({ aId: 1, bId: 2 })]);

    const same = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`, { aId: 1, bId: 2 }),
      codeParams(),
    );
    const reversed = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`, { aId: 2, bId: 1 }),
      codeParams(),
    );

    expect(same.status).toBe(400);
    expect(reversed.status).toBe(400);
    await expect(same.json()).resolves.toEqual({
      error: "That pair is already excluded.",
    });
    await expect(reversed.json()).resolves.toEqual({
      error: "That pair is already excluded.",
    });
    expect(mockDb.rows(schema.exclusion)).toHaveLength(1);
  });

  it("rejects a self-exclusion that already exists", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 3 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 3, personId: 3 })]);
    mockDb.seed(schema.exclusion, [makeExclusion({ aId: 3, bId: 3 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions`, { aId: 3, bId: 3 }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That pair is already excluded.",
    });
    expect(mockDb.rows(schema.exclusion)).toHaveLength(1);
  });
});
