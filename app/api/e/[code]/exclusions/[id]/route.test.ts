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
import { codeParams, emptyRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { DELETE } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

function params(id: string) {
  return codeParams(FIXTURE_EVENT_CODE, { id });
}

describe("DELETE /api/e/[code]/exclusions/[id]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "other1", seriesId: 1 }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1 }),
      makePerson({ id: 2 }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 3, eventId: 2, personId: 1 }),
    ]);
    mockDb.seed(schema.exclusion, [
      makeExclusion({ id: 1, eventId: 1, aId: 1, bId: 2 }),
      makeExclusion({ id: 2, eventId: 2, aId: 3, bId: 3 }),
    ]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions/1`, {
        method: "DELETE",
      }),
      params("1"),
    );
    expect(res.status).toBe(401);
    expect(mockDb.rows(schema.exclusion)).toHaveLength(2);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions/abc`, {
        method: "DELETE",
      }),
      params("abc"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid id." });
  });

  it("deletes the exclusion in this edition", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions/1`, {
        method: "DELETE",
      }),
      params("1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.exclusion).map((e) => e.id)).toEqual([2]);
  });

  it("leaves a row that belongs to another edition", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/exclusions/2`, {
        method: "DELETE",
      }),
      params("2"),
    );
    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.exclusion).map((e) => e.id)).toEqual([1, 2]);
  });
});
