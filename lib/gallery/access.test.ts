import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import type { GuestLink } from "@/lib/guest-link";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeEventPhoto,
  makeEventPhotoVariant,
  makeGuest,
  makeGuestView,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { db } from "@/lib/db";
import {
  eventByCodeOn,
  galleryEventForLink,
  galleryEventForTokenOn,
  guestGalleryMediaOn,
  personGaveOnEventOn,
  photoEventForLink,
} from "@/lib/gallery/access";

const TOKEN = "guesttokenaa";
const PHOTO = "p".repeat(32);

function link(drawEventId: number, personId = 1, drawId = 20): GuestLink {
  return {
    assignment: makeAssignment({
      drawId,
      giverId: 20,
      receiverId: 21,
      revealToken: TOKEN,
    }),
    draw: makeDraw({ id: drawId, eventId: drawEventId }),
    giver: makeGuestView({ id: 20, personId, eventId: drawEventId }),
    receiver: makeGuestView({ id: 21, personId: 2, eventId: drawEventId }),
  };
}

function seedCurrent() {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({ id: 2, occursOn: "2099-12-24", code: "now001" }),
  ]);
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 20, eventId: 2, personId: 1 }),
    makeGuest({ id: 21, eventId: 2, personId: 2 }),
  ]);
  mockDb.seed(schema.draw, [makeDraw({ id: 20, eventId: 2 })]);
  mockDb.seed(schema.assignment, [
    makeAssignment({
      id: 20,
      drawId: 20,
      giverId: 20,
      receiverId: 21,
      revealToken: TOKEN,
    }),
  ]);
}

describe("gallery access", () => {
  beforeEach(() => {
    seedCurrent();
  });

  it("refuses the token's own edition before the party date", async () => {
    expect(eventByCodeOn(db, "")).toBeUndefined();
    expect(await galleryEventForLink(link(2), "now001")).toBeNull();
    expect(
      galleryEventForTokenOn(db, {
        drawEventId: 99,
        personId: 1,
        drawId: 20,
        eventCode: "now001",
      }),
    ).toBeNull();
  });

  it("refuses the token's own edition when the party date is not a real calendar day", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, occursOn: "not-a-date", code: "now001" }),
    ]);
    expect(await galleryEventForLink(link(2), "now001")).toBeNull();
  });

  it("allows the token's own edition after the party date", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, occursOn: "2000-01-01", code: "now001" }),
    ]);
    expect((await galleryEventForLink(link(2), "now001"))?.code).toBe("now001");
  });

  it("allows an earlier series edition the person gave in, even before that date", async () => {
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2098-12-24", code: "past01" }),
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
        revealToken: "pasttokenaaa",
      }),
    );
    expect((await galleryEventForLink(link(2), "past01"))?.code).toBe("past01");
    expect(
      personGaveOnEventOn(db, {
        personId: 1,
        eventId: 1,
        seriesId: 1,
        occursOn: "2099-12-24",
        drawId: 20,
      }),
    ).toBe(true);
    const earlierPhoto = "e".repeat(32);
    mockDb.add(
      schema.eventPhoto,
      makeEventPhoto({ id: earlierPhoto, eventId: 1 }),
    );
    expect((await photoEventForLink(link(2), earlierPhoto))?.code).toBe(
      "past01",
    );
  });

  it("refuses an earlier edition whose party date is not a real calendar day", async () => {
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-13-40", code: "past01" }),
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
        revealToken: "pasttokenaaa",
      }),
    );
    expect(await galleryEventForLink(link(2), "past01")).toBeNull();
  });

  it("refuses another series and a year the person skipped", async () => {
    mockDb.add(schema.eventSeries, makeSeries({ id: 2, slug: "office" }));
    mockDb.add(
      schema.event,
      makeEvent({
        id: 3,
        seriesId: 2,
        occursOn: "2025-12-24",
        code: "office",
      }),
    );
    mockDb.add(
      schema.event,
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "past01" }),
    );
    mockDb.add(schema.guest, makeGuest({ id: 10, eventId: 1, personId: 2 }));
    expect(await galleryEventForLink(link(2), "office")).toBeNull();
    expect(await galleryEventForLink(link(2), "past01")).toBeNull();
    expect(await galleryEventForLink(link(2), "missing")).toBeNull();
    expect(
      personGaveOnEventOn(db, {
        personId: 1,
        eventId: 1,
        seriesId: 1,
        occursOn: "2099-12-24",
        drawId: 20,
      }),
    ).toBe(false);
  });

  it("resolves a photo through the same rule", async () => {
    mockDb.add(schema.eventPhoto, makeEventPhoto({ id: PHOTO, eventId: 2 }));
    expect(await photoEventForLink(link(2), PHOTO)).toBeNull();
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, occursOn: "2000-01-01", code: "now001" }),
    ]);
    expect((await photoEventForLink(link(2), PHOTO))?.code).toBe("now001");
    expect(await photoEventForLink(link(2), "q".repeat(32))).toBeNull();
    mockDb.add(
      schema.eventPhoto,
      makeEventPhoto({ id: "r".repeat(32), eventId: 99 }),
    );
    expect(await photoEventForLink(link(2), "r".repeat(32))).toBeNull();
  });

  it("loads guest media in one join after the party date", () => {
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, occursOn: "2000-01-01", code: "now001" }),
    ]);
    mockDb.add(schema.eventPhoto, makeEventPhoto({ id: PHOTO, eventId: 2 }));
    expect(guestGalleryMediaOn(db, link(2), PHOTO, "thumb")).toBeNull();
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({ photoId: PHOTO, status: "done" }),
    );
    expect(guestGalleryMediaOn(db, link(2), PHOTO, "thumb")).toMatchObject({
      photo: expect.objectContaining({ id: PHOTO }),
      variantReady: true,
    });
    expect(guestGalleryMediaOn(db, link(2), PHOTO, "original")).toMatchObject({
      variantReady: true,
    });
    expect(guestGalleryMediaOn(db, link(2), PHOTO, "hd")).toMatchObject({
      variantReady: false,
    });
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({
        id: 2,
        photoId: PHOTO,
        variant: "hd",
        status: "done",
      }),
    );
    expect(guestGalleryMediaOn(db, link(2), PHOTO, "hd")).toMatchObject({
      variantReady: true,
    });
  });

  it("refuses guest media before the party date even when the thumb is ready", () => {
    mockDb.add(schema.eventPhoto, makeEventPhoto({ id: PHOTO, eventId: 2 }));
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({ photoId: PHOTO, status: "done" }),
    );
    expect(guestGalleryMediaOn(db, link(2), PHOTO, "thumb")).toBeNull();
  });
});
