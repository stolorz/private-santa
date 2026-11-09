/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  makeWishlistItem,
} from "@/test/helpers/fixtures";
import { tokenParams } from "@/test/helpers/request";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import { OG_DEFAULTS, REVEAL_OG_COPY } from "@/lib/og";
import { galleryPath } from "@/lib/public-path";

const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import RevealPage, { generateMetadata } from "./page";
import * as store from "@/lib/gallery/store";
import * as wishlist from "@/lib/wishlist";

const TOKEN = "guest1";
const NOW = "now001";
const PAST = "past01";

function seedPair(opts?: {
  occursOn?: string;
  revealed?: boolean;
  pastPhotos?: boolean;
  currentThumb?: "done" | "pending" | "none";
}) {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({
      code: NOW,
      name: "Xmas",
      occursOn: opts?.occursOn ?? "2099-12-24",
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
      revealCount: opts?.revealed ? 1 : 0,
    }),
  ]);
  mockDb.seed(schema.wishlistItem, [
    makeWishlistItem({ id: 1, guestId: 1, text: "A scarf" }),
  ]);
  if (opts?.pastPhotos) {
    // Must be earlier than the current `occursOn` so history remaps it.
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
    const pastPhoto = "b".repeat(32);
    mockDb.add(
      schema.eventPhoto,
      makeEventPhoto({ id: pastPhoto, eventId: 2 }),
    );
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({
        photoId: pastPhoto,
        variant: "thumb",
        status: "done",
      }),
    );
  }
  if (opts?.currentThumb && opts.currentThumb !== "none") {
    const nowPhoto = "a".repeat(32);
    mockDb.add(schema.eventPhoto, makeEventPhoto({ id: nowPhoto }));
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({
        id: 2,
        photoId: nowPhoto,
        variant: "thumb",
        status: opts.currentThumb,
      }),
    );
  }
}

async function renderPage(token = TOKEN) {
  const ui = await RevealPage(tokenParams(token));
  return render(ui);
}

describe("guest reveal page", () => {
  beforeEach(() => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({
      ok: true,
      data: {},
      error: null,
      status: 200,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the invalid-link copy for an unknown token", async () => {
    await renderPage("missing");
    // Invalid links have no giver, so they use DEFAULT_LANGUAGE (Polish).
    expect(DEFAULT_LANGUAGE).toBe("pl");
    expect(screen.getByRole("heading", { name: "Nie znaleziono" })).toBeTruthy();
    expect(screen.getByText("Ten link jest nieprawidłowy.")).toBeTruthy();
  });

  it("keeps the wishlist and hides this year's photos before the party", async () => {
    seedPair({
      occursOn: "2099-12-24",
      revealed: true,
      pastPhotos: true,
      currentThumb: "done",
    });
    const countReady = vi.spyOn(store, "countReadyPhotos");
    await renderPage();
    expect(screen.getByText("Your wishlist")).toBeTruthy();
    expect(screen.getByText("A scarf")).toBeTruthy();
    expect(screen.queryByText(/Photos from Xmas$/)).toBeNull();
    expect(screen.getByText("Previous years")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Photos" }).getAttribute("href"),
    ).toContain(galleryPath(TOKEN, PAST));
    expect(countReady).not.toHaveBeenCalled();
  });

  it("locks the wishlist and links this year's photos after the party", async () => {
    seedPair({
      occursOn: "2026-01-02",
      revealed: true,
      pastPhotos: true,
      currentThumb: "done",
    });
    const listMine = vi.spyOn(wishlist, "listWishlistItems");
    await renderPage();
    expect(screen.queryByText("Your wishlist")).toBeNull();
    expect(screen.queryByText("A scarf")).toBeNull();
    expect(listMine).not.toHaveBeenCalledWith(1);
    expect(
      screen
        .getAllByRole("link", { name: "Photos" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(galleryPath(TOKEN, NOW)),
        expect.stringContaining(galleryPath(TOKEN, PAST)),
      ]),
    );
  });

  it("shows this year's photos card before unwrap after the party", async () => {
    seedPair({
      occursOn: "2000-01-01",
      revealed: false,
      currentThumb: "done",
    });
    await renderPage();
    expect(screen.queryByText("Your wishlist")).toBeNull();
    expect(screen.queryByText("Previous years")).toBeNull();
    expect(screen.getByRole("link", { name: "Photos" }).getAttribute("href")).toContain(
      galleryPath(TOKEN, NOW),
    );
  });

  it("omits this year's photos card when no thumbnail is ready", async () => {
    seedPair({
      occursOn: "2000-01-01",
      revealed: true,
      currentThumb: "pending",
    });
    await renderPage();
    expect(screen.queryByText("Your wishlist")).toBeNull();
    expect(screen.queryByRole("link", { name: "Photos" })).toBeNull();
  });

  it("keeps the wishlist when the edition row is missing", async () => {
    seedPair({ occursOn: "2000-01-01" });
    mockDb.seed(schema.event, []);
    await renderPage();
    expect(screen.getByText("Your wishlist")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Photos" })).toBeNull();
  });

  it("does not put names in the link-preview metadata", async () => {
    seedPair();
    const missing = await generateMetadata(tokenParams("missing"));
    expect(missing.robots).toBeUndefined();
    expect(missing.title).toBe(OG_DEFAULTS.title);

    const meta = await generateMetadata(tokenParams(TOKEN));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe(REVEAL_OG_COPY.en.title);
    expect(JSON.stringify(meta)).not.toMatch(/Ada|Bea|Xmas/);
  });
});
