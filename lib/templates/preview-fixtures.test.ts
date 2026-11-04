import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  budgetAmountsEqual,
  budgetChoiceError,
  type BudgetKind,
} from "@/lib/budget";
import { missingEventDateMessage } from "@/lib/event-date";
import { missingEventLocationSendReason } from "@/lib/event-location";
import {
  missingEventNameCasesMessage,
  missingEventTranslationsMessage,
} from "@/lib/event-name";
import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-contact";
import { missingPolishCasesMessage } from "@/lib/name-cases";
import { eventPatchSchema, personFieldsSchema } from "@/lib/schemas";
import { PREVIEW_EVENTS, PREVIEW_GUESTS } from "./preview-fixtures";

const PHOTO_DIR = path.join(process.cwd(), "public/preview/guests");

describe("preview fixtures", () => {
  it("passes the person form for every guest", () => {
    for (const guest of PREVIEW_GUESTS) {
      const parsed = personFieldsSchema.safeParse(guest);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(guest.name.trim().length).toBeGreaterThan(0);
      expect(missingPolishCasesMessage(guest)).toBeNull();
      expect(normalizeGuestPhone(guest.phone)).toBe(guest.phone);
      expect(normalizeGuestEmail(guest.email)).toBe(guest.email);
    }
  });

  it("passes the edition form for every event", () => {
    const dates = new Set<string>();
    for (const event of PREVIEW_EVENTS) {
      const parsed = eventPatchSchema.safeParse(event);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(missingEventDateMessage(event.occursOn)).toBeNull();
      expect(missingEventTranslationsMessage(event)).toBeNull();
      expect(missingEventNameCasesMessage(event)).toBeNull();
      expect(missingEventLocationSendReason(event)).toBeNull();
      expect(budgetChoiceError(event)).toBeNull();
      expect(event.nameEn?.trim().length).toBeGreaterThan(0);
      expect(dates.has(event.occursOn)).toBe(false);
      dates.add(event.occursOn);
    }
  });

  it("mixes languages, genders, contact, and photos", () => {
    expect(new Set(PREVIEW_GUESTS.map((guest) => guest.gender))).toEqual(
      new Set(["female", "male"]),
    );
    expect(new Set(PREVIEW_GUESTS.map((guest) => guest.language))).toEqual(
      new Set(["pl", "en", "de", "es", "ja"]),
    );
    expect(PREVIEW_GUESTS.some((guest) => guest.phone && guest.email)).toBe(true);
    expect(PREVIEW_GUESTS.some((guest) => guest.phone && !guest.email)).toBe(true);
    expect(PREVIEW_GUESTS.some((guest) => !guest.phone && guest.email)).toBe(true);
    expect(PREVIEW_GUESTS.some((guest) => !guest.phone && !guest.email)).toBe(true);
    expect(PREVIEW_GUESTS.some((guest) => guest.wishlist.length > 0)).toBe(true);
    expect(PREVIEW_GUESTS.some((guest) => guest.wishlist.length === 0)).toBe(true);
    expect(PREVIEW_GUESTS.find((guest) => guest.id === "joao")?.phone).toMatch(
      /^351/,
    );
    const photos = PREVIEW_GUESTS.map((guest) => guest.photo);
    expect(photos.some((photo) => photo == null)).toBe(true);
    expect(photos.some((photo) => photo != null)).toBe(true);
    for (const guest of PREVIEW_GUESTS) {
      if (!guest.photo) continue;
      expect(fs.existsSync(path.join(PHOTO_DIR, guest.photo))).toBe(true);
    }
  });

  it("covers a budget, make-the-gift, and no spending limit", () => {
    const kinds = new Set(PREVIEW_EVENTS.map((event) => event.budgetKind));
    expect(kinds).toEqual(new Set<BudgetKind>(["amount", "zero", "unlimited"]));
    for (const event of PREVIEW_EVENTS) {
      if (event.budgetKind === "amount") {
        expect(event.budget).toBeGreaterThan(0);
        expect(event.budgetEur).not.toBeNull();
        expect(event.budgetPln).not.toBeNull();
        expect(event.budgetJpy).not.toBeNull();
        const primary =
          event.currency === "EUR"
            ? event.budgetEur
            : event.currency === "PLN"
              ? event.budgetPln
              : event.budgetJpy;
        expect(budgetAmountsEqual(primary!, event.budget!)).toBe(true);
        continue;
      }
      expect(event.budget).toBeNull();
      expect(event.budgetEur).toBeNull();
      expect(event.budgetPln).toBeNull();
      expect(event.budgetJpy).toBeNull();
    }
    expect(PREVIEW_EVENTS.some((event) => event.currency === "EUR" && event.budgetKind === "amount")).toBe(true);
    expect(PREVIEW_EVENTS.some((event) => event.currency === "PLN" && event.budgetKind === "amount")).toBe(true);
  });

  it("seats real guests, including a full roster of twelve", () => {
    const ids = new Set(PREVIEW_GUESTS.map((guest) => guest.id));
    expect(ids.size).toBe(PREVIEW_GUESTS.length);
    for (const event of PREVIEW_EVENTS) {
      expect(event.guestIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(event.guestIds).size).toBe(event.guestIds.length);
      expect(event.guests.map((guest) => guest.id)).toEqual([...event.guestIds]);
      for (const id of event.guestIds) expect(ids.has(id)).toBe(true);
    }
    expect(PREVIEW_EVENTS.find((event) => event.id === "summer")?.guestIds).toHaveLength(
      PREVIEW_GUESTS.length,
    );
  });

  it("gives some editions past gifts and leaves first-year editions empty", () => {
    const ids = new Set(PREVIEW_GUESTS.map((guest) => guest.id));
    const withHistory = PREVIEW_EVENTS.filter(
      (event) => (event.previousGifts?.length ?? 0) > 0,
    );
    const withoutHistory = PREVIEW_EVENTS.filter(
      (event) => (event.previousGifts?.length ?? 0) === 0,
    );
    expect(withHistory.map((event) => event.id).sort()).toEqual(
      ["family", "office", "summer"].sort(),
    );
    expect(withoutHistory.map((event) => event.id).sort()).toEqual(
      ["alpine", "amigo", "children", "valentine"].sort(),
    );
    for (const event of PREVIEW_EVENTS) {
      const eventYear = Number(event.occursOn.slice(0, 4));
      for (const gift of event.previousGifts ?? []) {
        expect(ids.has(gift.giverId)).toBe(true);
        expect(ids.has(gift.receiverId)).toBe(true);
        expect(gift.year).toBeLessThan(eventYear);
        expect(gift.giverId).not.toBe(gift.receiverId);
      }
    }
    expect(
      PREVIEW_EVENTS.find((event) => event.id === "family")?.previousGifts?.some(
        (gift) => gift.giverId === "anna" && gift.receiverId === "lucia",
      ),
    ).toBe(true);
  });
});
