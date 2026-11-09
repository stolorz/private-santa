/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { tokenParams } from "@/test/helpers/request";
import { OG_DEFAULTS, REVEAL_OG_COPY } from "@/lib/og";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import GuestGalleryPage, { generateMetadata } from "./page";

const TOKEN = "guest1";
const NOW = "now001";
const PAST = "past01";
const NOW_PHOTO = "a".repeat(32);
const PAST_PHOTO = "b".repeat(32);

function seedPair(occursOn = "2099-12-24") {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({
      code: NOW,
      name: "Xmas",
      occursOn,
    }),
  ]);
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

function seedPastEdition() {
  mockDb.add(
    schema.event,
    makeEvent({
      id: 2,
      occursOn: "2025-12-24",
      code: PAST,
      name: "Xmas 2025",
    }),
  );
  mockDb.add(
    schema.guest,
    makeGuest({ id: 10, eventId: 2, personId: 1 }),
    makeGuest({ id: 11, eventId: 2, personId: 2 }),
  );
  mockDb.add(schema.draw, makeDraw({ id: 2, eventId: 2 }));
  mockDb.add(
    schema.assignment,
    makeAssignment({
      id: 2,
      drawId: 2,
      giverId: 10,
      receiverId: 11,
      revealToken: "pasttokenaaa",
    }),
  );
  mockDb.add(
    schema.eventPhoto,
    makeEventPhoto({ id: PAST_PHOTO, eventId: 2 }),
  );
  mockDb.add(
    schema.eventPhotoVariant,
    makeEventPhotoVariant({
      photoId: PAST_PHOTO,
      variant: "thumb",
      status: "done",
    }),
  );
}

async function renderGallery(token = TOKEN, code = NOW) {
  const ui = await GuestGalleryPage(tokenParams(token, { code }));
  return render(ui);
}

describe("guest gallery page", () => {
  beforeEach(() => {
    seedPair();
  });

  it("shows the invalid-link copy for an unknown token", async () => {
    // Invalid links have no giver, so they use DEFAULT_LANGUAGE (Polish).
    await renderGallery("missing", NOW);
    expect(screen.getByRole("heading", { name: "Nie znaleziono" })).toBeTruthy();
    expect(screen.getByText("Ten link jest nieprawidłowy.")).toBeTruthy();
  });

  it("shows the same invalid-link copy for an unknown edition", async () => {
    await renderGallery(TOKEN, "nope01");
    expect(screen.getByRole("heading", { name: "Nie znaleziono" })).toBeTruthy();
    expect(screen.getByText("Ten link jest nieprawidłowy.")).toBeTruthy();
  });

  it("refuses this year's gallery before the party date", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: NOW_PHOTO })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        photoId: NOW_PHOTO,
        variant: "thumb",
        status: "done",
      }),
    ]);
    await renderGallery(TOKEN, NOW);
    expect(screen.getByText("Ten link jest nieprawidłowy.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("opens this year's gallery after the party date", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ code: NOW, name: "Xmas", occursOn: "2000-01-01" }),
    ]);
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: NOW_PHOTO })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        photoId: NOW_PHOTO,
        variant: "thumb",
        status: "done",
      }),
    ]);
    await renderGallery(TOKEN, NOW);
    expect(screen.getByRole("heading", { name: /Photos from Xmas/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" })).toHaveProperty(
      "href",
      expect.stringMatching(new RegExp(`/${TOKEN}$`)),
    );
  });

  it("opens an empty gallery after the party when no thumbs are ready", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ code: NOW, name: "Xmas", occursOn: "2000-01-01" }),
    ]);
    await renderGallery(TOKEN, NOW);
    expect(screen.queryByText("Ten link jest nieprawidłowy.")).toBeNull();
    expect(screen.getByRole("heading", { name: /Photos from Xmas/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("opens a previous-year gallery while this year's party is still ahead", async () => {
    seedPastEdition();
    await renderGallery(TOKEN, PAST);
    expect(screen.queryByText("This link is invalid.")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Photos from Xmas 2025/ }),
    ).toBeTruthy();
  });

  it("does not put names in the link-preview metadata", async () => {
    const missing = await generateMetadata(tokenParams("missing"));
    expect(missing.robots).toBeUndefined();
    expect(missing.title).toBe(OG_DEFAULTS.title);

    const meta = await generateMetadata(tokenParams(TOKEN));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe(REVEAL_OG_COPY.en.title);
    expect(JSON.stringify(meta)).not.toMatch(/Ada|Bea|Xmas/);
  });
});
