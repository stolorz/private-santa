import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { listPastGiftsForGiver } from "@/lib/reveal-history";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeEventPhoto,
  makeEventPhotoVariant,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";

const CURRENT = {
  personId: 1,
  seriesId: 1,
  occursOn: "2026-12-24",
  drawId: 20,
};

function seedCurrentEdition() {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.add(
    schema.event,
    makeEvent({ id: 2, occursOn: CURRENT.occursOn, code: "now001" }),
  );
  mockDb.add(
    schema.person,
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  );
  mockDb.add(
    schema.guest,
    makeGuest({ id: 20, eventId: 2, personId: 1 }),
    makeGuest({ id: 21, eventId: 2, personId: 2 }),
  );
  mockDb.add(schema.draw, makeDraw({ id: 20, eventId: 2 }));
  mockDb.add(
    schema.assignment,
    makeAssignment({
      id: 20,
      drawId: 20,
      giverId: 20,
      receiverId: 21,
      revealToken: "currenttokena",
    }),
  );
}

describe("listPastGiftsForGiver", () => {
  it("returns empty on a first edition", async () => {
    seedCurrentEdition();
    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([]);
  });

  it("returns empty when the giver sat in a past edition that never drew", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
    );
    mockDb.add(schema.guest, makeGuest({ id: 10, eventId: 1, personId: 1 }));
    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([]);
  });

  it("ignores other series and later editions", async () => {
    seedCurrentEdition();
    mockDb.add(schema.eventSeries, makeSeries({ id: 2, slug: "office" }));
    mockDb.add(
      schema.event,
      makeEvent({
        id: 1,
        occursOn: "2025-12-24",
        code: "past01",
      }),
      makeEvent({
        id: 3,
        seriesId: 2,
        occursOn: "2025-12-18",
        code: "offc01",
      }),
      makeEvent({
        id: 4,
        occursOn: "2027-12-24",
        code: "next01",
      }),
    );
    mockDb.add(
      schema.person,
      makePerson({ id: 3, name: "Cara" }),
      makePerson({ id: 4, name: "Drew" }),
    );
    mockDb.add(
      schema.guest,
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
      makeGuest({ id: 30, eventId: 3, personId: 1 }),
      makeGuest({ id: 31, eventId: 3, personId: 3 }),
      makeGuest({ id: 40, eventId: 4, personId: 1 }),
      makeGuest({ id: 41, eventId: 4, personId: 4 }),
    );
    mockDb.add(
      schema.draw,
      makeDraw({ id: 1, eventId: 1 }),
      makeDraw({ id: 3, eventId: 3 }),
      makeDraw({ id: 4, eventId: 4 }),
    );
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 11,
        revealToken: "pasttokenaaa",
      }),
      makeAssignment({
        id: 3,
        drawId: 3,
        giverId: 30,
        receiverId: 31,
        revealToken: "officetokena",
      }),
      makeAssignment({
        id: 4,
        drawId: 4,
        giverId: 40,
        receiverId: 41,
        revealToken: "nexttokenaaa",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({
        name: "Bea",
        year: "2025",
        personId: 2,
        eventCode: "past01",
        photoCount: 0,
      }),
    ]);
  });

  it("keeps only the latest draw of a past edition", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
    );
    mockDb.add(
      schema.person,
      makePerson({ id: 3, name: "Cara" }),
    );
    mockDb.add(
      schema.guest,
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
      makeGuest({ id: 12, eventId: 1, personId: 3 }),
    );
    mockDb.add(
      schema.draw,
      makeDraw({
        id: 1,
        eventId: 1,
        createdAt: new Date("2025-11-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 2,
        eventId: 1,
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
      }),
    );
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 11,
        revealToken: "olddrawtokena",
      }),
      makeAssignment({
        id: 2,
        drawId: 2,
        giverId: 10,
        receiverId: 12,
        revealToken: "newdrawtokena",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({ name: "Cara", year: "2025", personId: 3 }),
    ]);
  });

  it("lists a receiver who is not seated this year, using the current person name", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
    );
    mockDb.add(
      schema.person,
      makePerson({
        id: 3,
        name: "Cara Now",
        nameDopelniacz: "Cary Now",
      }),
    );
    mockDb.add(
      schema.guest,
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 13, eventId: 1, personId: 3 }),
    );
    mockDb.add(schema.draw, makeDraw({ id: 1, eventId: 1 }));
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 13,
        revealToken: "pasttokenaaa",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({
        name: "Cara Now",
        nameDopelniacz: "Cary Now",
        year: "2025",
        personId: 3,
      }),
    ]);
  });

  it("orders newest year first and omits a skipped year", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2023-12-24", code: "past23" }),
      makeEvent({ id: 3, occursOn: "2024-12-24", code: "past24" }),
      makeEvent({ id: 4, occursOn: "2025-12-24", code: "past25" }),
    );
    mockDb.add(
      schema.person,
      makePerson({ id: 3, name: "Cara" }),
      makePerson({ id: 4, name: "Drew" }),
    );
    mockDb.add(
      schema.guest,
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 3 }),
      makeGuest({ id: 30, eventId: 3, personId: 2 }),
      makeGuest({ id: 31, eventId: 3, personId: 4 }),
      makeGuest({ id: 40, eventId: 4, personId: 1 }),
      makeGuest({ id: 41, eventId: 4, personId: 4 }),
    );
    mockDb.add(
      schema.draw,
      makeDraw({ id: 1, eventId: 1 }),
      makeDraw({ id: 3, eventId: 3 }),
      makeDraw({ id: 4, eventId: 4 }),
    );
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 11,
        revealToken: "token2023aaa",
      }),
      makeAssignment({
        id: 3,
        drawId: 3,
        giverId: 30,
        receiverId: 31,
        revealToken: "token2024aaa",
      }),
      makeAssignment({
        id: 4,
        drawId: 4,
        giverId: 40,
        receiverId: 41,
        revealToken: "token2025aaa",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({ name: "Drew", year: "2025" }),
      expect.objectContaining({ name: "Cara", year: "2023" }),
    ]);
  });

  it("skips a past edition whose party date is not a real calendar day", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-13-40", code: "bad001" }),
      makeEvent({ id: 3, occursOn: "2024-12-24", code: "past24" }),
    );
    mockDb.add(
      schema.guest,
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
      makeGuest({ id: 30, eventId: 3, personId: 1 }),
      makeGuest({ id: 31, eventId: 3, personId: 2 }),
    );
    mockDb.add(
      schema.draw,
      makeDraw({ id: 1, eventId: 1 }),
      makeDraw({ id: 3, eventId: 3 }),
    );
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 11,
        revealToken: "badtokenaaaa",
      }),
      makeAssignment({
        id: 3,
        drawId: 3,
        giverId: 30,
        receiverId: 31,
        revealToken: "oktokenaaaaa",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({ name: "Bea", year: "2024" }),
    ]);
  });

  it("includes a self-draw from a previous year", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
    );
    mockDb.add(schema.guest, makeGuest({ id: 10, eventId: 1, personId: 1 }));
    mockDb.add(schema.draw, makeDraw({ id: 1, eventId: 1 }));
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 10,
        revealToken: "selftokenaaa",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({ name: "Ada", year: "2025", personId: 1 }),
    ]);
  });

  it("counts ready thumbnails on a past edition", async () => {
    seedCurrentEdition();
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
    );
    mockDb.add(schema.guest, makeGuest({ id: 10, eventId: 1, personId: 1 }));
    mockDb.add(schema.draw, makeDraw({ id: 1, eventId: 1 }));
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 10,
        receiverId: 10,
        revealToken: "selftokenaaa",
      }),
    );
    mockDb.add(
      schema.eventPhoto,
      makeEventPhoto({ id: "b".repeat(32), eventId: 1 }),
      makeEventPhoto({ id: "c".repeat(32), eventId: 1 }),
    );
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({
        id: 1,
        photoId: "b".repeat(32),
        variant: "thumb",
        status: "done",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: "c".repeat(32),
        variant: "thumb",
        status: "pending",
      }),
    );

    await expect(listPastGiftsForGiver(CURRENT)).resolves.toEqual([
      expect.objectContaining({ eventCode: "past01", photoCount: 1 }),
    ]);
  });
});
