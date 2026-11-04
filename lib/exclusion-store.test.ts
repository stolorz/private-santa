import { describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeExclusion,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import {
  addExclusion,
  listExclusions,
  removeExclusion,
} from "@/lib/exclusion-store";
import { EventError } from "@/lib/errors";

function seedEdition() {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({ id: 1 }),
    makeEvent({ id: 2, code: "other1", seriesId: 1 }),
  ]);
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 1, eventId: 1, personId: 1 }),
    makeGuest({ id: 2, eventId: 1, personId: 2 }),
    makeGuest({ id: 3, eventId: 2, personId: 1 }),
  ]);
}

describe("exclusion-store", () => {
  it("lists exclusions for one edition", async () => {
    seedEdition();
    mockDb.seed(schema.exclusion, [
      makeExclusion({ id: 1, eventId: 1, aId: 1, bId: 2 }),
      makeExclusion({ id: 2, eventId: 2, aId: 3, bId: 3 }),
    ]);

    await expect(listExclusions(1)).resolves.toEqual([
      expect.objectContaining({ id: 1, eventId: 1, aId: 1, bId: 2 }),
    ]);
  });

  it("stores an unordered pair with aId <= bId", async () => {
    seedEdition();
    const row = await addExclusion(1, 2, 1);
    expect(row).toMatchObject({ eventId: 1, aId: 1, bId: 2 });
  });

  it("rejects guests from another edition", async () => {
    seedEdition();
    await expect(addExclusion(1, 1, 3)).rejects.toThrow(EventError);
  });

  it("removes only the matching row in that edition", async () => {
    seedEdition();
    mockDb.seed(schema.exclusion, [
      makeExclusion({ id: 1, eventId: 1, aId: 1, bId: 2 }),
      makeExclusion({ id: 2, eventId: 2, aId: 3, bId: 3 }),
    ]);

    await removeExclusion(1, 1);
    expect(mockDb.rows(schema.exclusion).map((e) => e.id)).toEqual([2]);

    await removeExclusion(1, 2);
    expect(mockDb.rows(schema.exclusion).map((e) => e.id)).toEqual([2]);

    await removeExclusion(1, 99);
    expect(mockDb.rows(schema.exclusion).map((e) => e.id)).toEqual([2]);
  });
});
