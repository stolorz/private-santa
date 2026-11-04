import { describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  eventLocation,
  eventNameTranslations,
  makeDraw,
  polishNameCases,
  makeEvent,
  makeExclusion,
  makeGuest,
  makePerson,
  makeSeries,
  makeEventTemplate,
  makeWishlistItem,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { db } from "@/lib/db";
import {
  createEdition,
  createSeriesWithFirstEdition,
  deleteEdition,
  eventImpact,
  hasEarlierEdition,
  uniqueEventCode,
  uniqueSeriesSlug,
  updateEdition,
  visibleEventsFor,
  visibleSeriesFor,
} from "@/lib/events";
import { EventError } from "@/lib/errors";
import * as eventCodeMod from "@/lib/event-code";
import * as people from "@/lib/people";
import { TEMPLATE_DEFAULTS, TEMPLATE_IDS, TEMPLATE_LANGUAGES } from "@/lib/templates/fields";
import { setTemplates } from "@/lib/templates/reference";
import { getEventTemplates, setEventTemplates } from "@/lib/templates/store";
import { useTempTemplateDefaults } from "@/test/helpers/template-defaults";

describe("uniqueSeriesSlug", () => {
  it("appends -2 when the base slug is taken", async () => {
    mockDb.seed(schema.eventSeries, [
      makeSeries({ id: 2, name: "Xmas", slug: "xmas" }),
    ]);
    await expect(uniqueSeriesSlug("Xmas")).resolves.toBe("xmas-2");
  });
});

describe("uniqueEventCode", () => {
  it("allocates a 6-char id of digits and latin letters", async () => {
    await expect(uniqueEventCode()).resolves.toMatch(/^[0-9a-z]{6}$/);
  });

  it("throws after 20 collisions", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ code: "aaaaaa" })]);
    vi.spyOn(eventCodeMod, "eventCode").mockReturnValue("aaaaaa");
    await expect(uniqueEventCode()).rejects.toThrow(
      "Could not allocate an event id.",
    );
  });
});

describe("createSeriesWithFirstEdition", () => {
  it("creates a series and a first edition with a generated code", async () => {
    const created = await createSeriesWithFirstEdition({
      name: "Xmas",
      occursOn: "2026-12-25",
    });
    expect(created.series).toMatchObject({ name: "Xmas", slug: "xmas" });
    expect(created.event).toMatchObject({
      seriesId: created.series.id,
      name: "Xmas",
      occursOn: "2026-12-25",
      budget: null,
      currency: "EUR",
      allowSelfDraw: false,
      avoidPastPairings: false,
    });
    expect(created.event.code).toMatch(/^[0-9a-z]{6}$/);
  });

  it("allows two events with the same name and distinct codes", async () => {
    const first = await createSeriesWithFirstEdition({
      name: "Xmas",
      occursOn: "2026-12-25",
    });
    const second = await createSeriesWithFirstEdition({
      name: "Xmas",
      occursOn: "2026-12-25",
    });
    expect(first.event.name).toBe("Xmas");
    expect(second.event.name).toBe("Xmas");
    expect(first.event.code).toMatch(/^[0-9a-z]{6}$/);
    expect(second.event.code).toMatch(/^[0-9a-z]{6}$/);
    expect(first.event.code).not.toBe(second.event.code);
  });
});

describe("createEdition", () => {
  it("copies guests and exclusions by person and leaves wishlists empty", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({
        id: 1,
        seriesId: 1,
        code: "xmas_20251224",
        occursOn: "2025-12-24",
        budget: 30,
        currency: "PLN",
        budgetEur: 6,
        budgetPln: 30,
        budgetJpy: 1100,
      }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
    ]);
    mockDb.seed(schema.exclusion, [
      makeExclusion({ id: 1, eventId: 1, aId: 10, bId: 11 }),
    ]);
    mockDb.seed(schema.wishlistItem, [
      makeWishlistItem({ id: 1, guestId: 10, text: "Last year" }),
    ]);

    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas",
    });

    expect(edition.code).toMatch(/^[0-9a-z]{6}$/);
    expect(edition).toMatchObject({
      budget: 30,
      currency: "PLN",
      budgetEur: 6,
      budgetPln: 30,
      budgetJpy: 1100,
      allowSelfDraw: false,
      avoidPastPairings: true,
    });
    const guests = mockDb.rows(schema.guest).filter((g) => g.eventId === edition.id);
    expect(guests.map((g) => g.personId).sort()).toEqual([1, 2]);
    expect(guests.map((g) => g.id).sort()).not.toEqual([10, 11]);

    const copied = mockDb.rows(schema.exclusion).filter((e) => e.eventId === edition.id);
    expect(copied).toHaveLength(1);
    const byPerson = new Map(guests.map((g) => [g.personId, g.id]));
    expect(copied[0]).toMatchObject({
      aId: byPerson.get(1),
      bId: byPerson.get(2),
    });

    expect(
      mockDb.rows(schema.wishlistItem).filter((w) =>
        guests.some((g) => g.id === w.guestId),
      ),
    ).toHaveLength(0);
  });

  it("does not copy automatic exclusions from the source edition", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({
        allowSelfDraw: true,
        avoidPastPairings: false,
        occursOn: "2025-12-24",
        code: "xmas_2025",
      }),
    ]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas",
    });
    expect(edition).toMatchObject({
      allowSelfDraw: false,
      avoidPastPairings: true,
    });
  });

  it("leaves avoidPastPairings off when no earlier edition exists", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ occursOn: "2026-12-25", code: "xmas_2026" }),
    ]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2025-12-24",
      name: "Xmas",
    });
    expect(edition.avoidPastPairings).toBe(false);
    expect(edition.allowSelfDraw).toBe(false);
  });

  it("copies from the given edition rather than the latest", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, seriesId: 1, code: "xmas_2025", occursOn: "2025-12-24" }),
      makeEvent({ id: 2, seriesId: 1, code: "xmas_2026", occursOn: "2026-12-24" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cal" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
      makeGuest({ id: 12, eventId: 2, personId: 3 }),
    ]);

    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2027-12-25",
      name: "Xmas",
      fromEventId: 1,
    });

    const guests = mockDb.rows(schema.guest).filter((g) => g.eventId === edition.id);
    expect(guests.map((g) => g.personId).sort()).toEqual([1, 2]);
  });

  it("copies localized names and Polish cases from the source edition", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({
        id: 1,
        seriesId: 1,
        code: "xmas_2025",
        occursOn: "2025-12-24",
        name: "Xmas 2025",
        nameEn: "Family Christmas",
        nameDe: "Weihnachten",
        nameEs: "Navidad",
        nameJa: "ファミリークリスマス",
        namePl: "Rodzinne Święta",
        nameDopelniacz: "Rodzinnych Świąt",
        ...eventLocation(),
      }),
    ]);

    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas 2026",
      fromEventId: 1,
    });

    expect(edition).toMatchObject({
      name: "Xmas 2026",
      nameEn: "Family Christmas",
      nameDe: "Weihnachten",
      nameEs: "Navidad",
      nameJa: "ファミリークリスマス",
      namePl: "Rodzinne Święta",
      nameDopelniacz: "Rodzinnych Świąt",
      location: "Katowice",
      locationGdzie: "w Katowicach",
    });
  });

  it("starts without a location when there is no source edition", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas 2026",
    });
    expect(edition).toMatchObject({ location: null, locationGdzie: null });
  });

  it("snapshots the JSON reference onto a first edition", async () => {
    const created = await createSeriesWithFirstEdition({
      name: "Xmas",
      occursOn: "2026-12-25",
    });
    const rows = mockDb
      .rows(schema.eventTemplate)
      .filter((row) => row.eventId === created.event.id);
    expect(rows).toHaveLength(
      TEMPLATE_LANGUAGES.length * TEMPLATE_IDS.length,
    );
    expect(await getEventTemplates(created.event.id)).toMatchObject({
      en: { "email.button": TEMPLATE_DEFAULTS.en["email.button"] },
    });
  });

  it("copies the source edition's templates and ignores later JSON and source edits", async () => {
    useTempTemplateDefaults();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ id: 1 })]);
    await setEventTemplates(1, {
      en: { "email.subject": "Source {event}" },
    });

    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas 2026",
      fromEventId: 1,
    });

    expect((await getEventTemplates(edition.id)).en["email.subject"]).toBe(
      "Source {event}",
    );

    await setTemplates({ en: { "email.subject": "New default {event}" } });
    await setEventTemplates(1, {
      en: { "email.subject": "Edited source {event}" },
    });
    expect((await getEventTemplates(edition.id)).en["email.subject"]).toBe(
      "Source {event}",
    );
    expect((await getEventTemplates(1)).en["email.subject"]).toBe(
      "Edited source {event}",
    );
  });

  it("snapshots JSON when the source edition has no template rows", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ id: 1 })]);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        eventId: 99,
        templateId: "email.subject",
        language: "en",
        value: "Unrelated",
      }),
    ]);

    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas 2026",
      fromEventId: 1,
    });
    expect((await getEventTemplates(edition.id)).en["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.en["email.subject"],
    );
  });
});

describe("visibleEventsFor", () => {
  it("returns every edition for a site admin", async () => {
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent(),
      makeEvent({ id: 2, seriesId: 2, code: "office_20260101" }),
    ]);

    const rows = await visibleEventsFor({ id: "admin", role: "admin" });
    expect(rows.map((r) => r.event.code).sort()).toEqual([
      "office_20260101",
      "xmas_20260101",
    ]);
  });

  it("returns no editions for a non-admin", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, userId: "user_1" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    await expect(
      visibleEventsFor({ id: "user_1", role: "user" }),
    ).resolves.toEqual([]);
  });

  it("groups editions into series for an admin", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2025-12-24" }),
      makeEvent({ id: 2, code: "later1", occursOn: "2026-12-24" }),
    ]);
    const series = await visibleSeriesFor({ id: "admin", role: "admin" });
    expect(series).toHaveLength(1);
    expect(series[0].editions.map((e) => e.id)).toEqual([2, 1]);
    await expect(
      visibleSeriesFor({ id: "user_1", role: "user" }),
    ).resolves.toEqual([]);
  });

  it("counts template, guest, and settings problems on each edition", async () => {
    useTempTemplateDefaults();
    const filled = {
      name: "Xmas",
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "amount" as const,
      budget: 20,
      currency: "EUR" as const,
      budgetEur: 20,
      budgetPln: 85,
      budgetJpy: 3200,
    };
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, code: "done01", occursOn: "2026-12-24", ...filled }),
      makeEvent({
        id: 2,
        code: "todo02",
        occursOn: "2025-12-24",
        ...filled,
        location: null,
      }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        gender: "female",
        ...polishNameCases("Ada"),
      }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        id: 1,
        eventId: 2,
        templateId: "email.subject",
        language: "en",
        value: "{nope}",
      }),
    ]);

    const series = await visibleSeriesFor({ id: "admin", role: "admin" });
    const counts = Object.fromEntries(
      series[0]!.editions.map((edition) => [edition.code, edition.problemCount]),
    );
    expect(counts).toEqual({ done01: 0, todo02: 3 });
  });
});

describe("eventImpact", () => {
  it("returns an empty guest list for an edition with no seats", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);

    const result = await eventImpact(makeEvent(), makeSeries());
    expect(result.impact.guests).toBe(0);
    expect(result.guests).toEqual([]);
  });

  it("marks exclusive vs shared guests and sorts by name", async () => {
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, seriesId: 1, code: "xmas_2026" }),
      makeEvent({ id: 3, seriesId: 2, code: "office_20260101" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Cyd" }),
      makePerson({ id: 2, name: "ada" }),
      makePerson({ id: 3, name: "Bea" }),
      makePerson({ id: 4, name: "Dot" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 30, eventId: 1, personId: 1 }),
      makeGuest({ id: 10, eventId: 1, personId: 2 }),
      makeGuest({ id: 20, eventId: 1, personId: 3 }),
      makeGuest({ id: 21, eventId: 2, personId: 3 }),
      makeGuest({ id: 40, eventId: 3, personId: 4 }),
      makeGuest({ id: 41, eventId: 1, personId: 4 }),
    ]);

    const result = await eventImpact(makeEvent(), makeSeries());
    expect(result.impact.guests).toBe(4);
    expect(result.guests).toEqual([
      { personId: 2, name: "ada", exclusive: true },
      { personId: 3, name: "Bea", exclusive: false },
      { personId: 1, name: "Cyd", exclusive: true },
      { personId: 4, name: "Dot", exclusive: false },
    ]);
  });

  it("treats a missing count row as zero", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    const orig = db.select.bind(db);
    vi.spyOn(db, "select").mockImplementation((fields?: Record<string, unknown>) => {
      if (fields && "c" in fields) {
        const query = {
          from: () => query,
          where: () => query,
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => Promise.resolve([]).then(resolve, reject),
        };
        return query as never;
      }
      return orig(fields as never);
    });

    const result = await eventImpact(makeEvent(), makeSeries());
    expect(result.impact.exclusions).toBe(0);
    expect(result.impact.wishlists).toBe(0);
    expect(result.impact.otherEditions).toBe(0);
  });
});

describe("deleteEdition", () => {
  it("refuses an edition with a completed draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);
    await expect(deleteEdition(makeEvent())).rejects.toThrow(EventError);
  });

  it("refuses a completed draw before deleting any selected people", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);

    await expect(deleteEdition(makeEvent(), [1])).rejects.toThrow(
      "Cannot delete an edition that has completed draws.",
    );
    expect(mockDb.rows(schema.event)).toHaveLength(1);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1]);
    expect(mockDb.rows(schema.guest)).toHaveLength(1);
  });

  it("deletes the series when the last edition goes", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    await deleteEdition(makeEvent());
    expect(mockDb.rows(schema.event)).toEqual([]);
    expect(mockDb.rows(schema.eventSeries)).toEqual([]);
  });

  it("keeps the series when another edition remains", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    await deleteEdition(makeEvent({ id: 1 }));
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([2]);
    expect(mockDb.rows(schema.eventSeries)).toHaveLength(1);
  });

  it("keeps people when no deletePersonIds are given", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
    ]);

    await deleteEdition(makeEvent());
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([2]);
    expect(mockDb.rows(schema.guest)).toEqual([]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1, 2]);
  });

  it("deletes exclusive people and leaves the others", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", photo: "ada.jpg" }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cyd" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 3, eventId: 1, personId: 3 }),
      makeGuest({ id: 4, eventId: 2, personId: 3 }),
    ]);

    await deleteEdition(makeEvent(), [1]);
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([2]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2, 3]);
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([4]);
  });

  it("collapses duplicate exclusive ids and still deletes the person", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    await deleteEdition(makeEvent(), [1, 1]);
    expect(mockDb.rows(schema.person)).toEqual([]);
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([2]);
  });

  it("does not delete a shared person or the event", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    await expect(deleteEdition(makeEvent(), [1])).rejects.toThrow(
      "Cannot delete a guest who is in another event.",
    );
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([1, 2]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1]);
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([1, 2]);
  });

  it("rejects a mix of exclusive and shared ids without deleting anything", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 3, eventId: 2, personId: 2 }),
    ]);

    await expect(deleteEdition(makeEvent(), [1, 2])).rejects.toThrow(
      "Cannot delete a guest who is in another event.",
    );
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([1, 2]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1, 2]);
    expect(mockDb.rows(schema.guest)).toHaveLength(3);
  });

  it("rejects a person who is not a guest of this event", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 2, personId: 1 })]);

    await expect(deleteEdition(makeEvent(), [1])).rejects.toThrow(
      "Cannot delete a guest who is not in this event.",
    );
    await expect(deleteEdition(makeEvent(), [99])).rejects.toThrow(
      "Cannot delete a guest who is not in this event.",
    );
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([1, 2]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1]);
  });

  it("deletes the series and selected exclusive people when the last edition goes", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
    ]);

    await deleteEdition(makeEvent(), [1]);
    expect(mockDb.rows(schema.event)).toEqual([]);
    expect(mockDb.rows(schema.eventSeries)).toEqual([]);
    expect(mockDb.rows(schema.guest)).toEqual([]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2]);
  });

  it("deletes the edition without removing people who are not exclusive", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "later1" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);
    vi.spyOn(people, "peopleExclusiveToEvent").mockReturnValue({
      exclusive: [],
      notSeated: [],
      shared: [],
    });

    await deleteEdition(makeEvent(), [1]);
    expect(mockDb.rows(schema.event).map((e) => e.id)).toEqual([2]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1]);
  });
});

describe("createEdition errors", () => {
  it("copies a positive amount with no kind as a budget", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({
        id: 1,
        code: "old001",
        occursOn: "2025-12-24",
        budgetKind: null,
        budget: 40,
        currency: "PLN",
        budgetEur: 10,
        budgetPln: 40,
        budgetJpy: 1600,
      }),
    ]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Next",
    });
    expect(edition).toMatchObject({
      budgetKind: "amount",
      budget: 40,
      currency: "PLN",
      budgetEur: 10,
      budgetPln: 40,
      budgetJpy: 1600,
    });
  });

  it("copies an explicit make-the-gift choice ahead of a stored amount", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({
        id: 1,
        code: "old001",
        occursOn: "2025-12-24",
        budgetKind: "zero",
        budget: 40,
        currency: "EUR",
      }),
    ]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Next",
      fromEventId: 1,
    });
    expect(edition).toMatchObject({
      budgetKind: "zero",
      budget: 40,
      currency: "EUR",
    });
  });

  it("creates a first edition without copying budget or guests", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2026-12-25",
      name: "Xmas",
    });
    expect(edition).toMatchObject({
      budgetKind: null,
      budget: null,
      currency: "EUR",
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    });
    expect(mockDb.rows(schema.guest)).toEqual([]);
  });

  it("rejects an unknown series", async () => {
    await expect(
      createEdition({ seriesId: 9, occursOn: "2026-12-25", name: "Xmas" }),
    ).rejects.toThrow("Unknown series.");
  });

  it("rejects a source edition from another series", async () => {
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, seriesId: 2, code: "office1" }),
    ]);
    await expect(
      createEdition({
        seriesId: 1,
        occursOn: "2026-12-25",
        name: "Xmas",
        fromEventId: 2,
      }),
    ).rejects.toThrow("Unknown source edition.");
  });

  it("skips exclusions whose guests are missing from the source", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 10, personId: 1 })]);
    mockDb.seed(schema.exclusion, [
      makeExclusion({ id: 1, eventId: 1, aId: 10, bId: 99 }),
      makeExclusion({ id: 2, eventId: 1, aId: 98, bId: 99 }),
    ]);
    const edition = await createEdition({
      seriesId: 1,
      occursOn: "2027-12-25",
      name: "Xmas",
    });
    expect(
      mockDb.rows(schema.exclusion).filter((e) => e.eventId === edition.id),
    ).toEqual([]);
  });
});

describe("updateEdition", () => {
  it("rejects an invalid party date", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    await expect(
      updateEdition(makeEvent(), { occursOn: "not-a-date" }),
    ).rejects.toThrow("Date must be YYYY-MM-DD.");
  });

  it("refuses to clear the party date", async () => {
    const event = makeEvent({ ...eventNameTranslations() });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { occursOn: "" })).rejects.toThrow(
      "Enter the event date. Guest messages will include it, so these details cannot be saved without one.",
    );
    expect(mockDb.rows(schema.event)[0]?.occursOn).toBe("2026-01-01");
  });

  it("refuses other edits when the stored date is blank", async () => {
    const event = makeEvent({ occursOn: "", ...eventNameTranslations() });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { name: "Later" })).rejects.toThrow(
      "Enter the event date. Guest messages will include it, so these details cannot be saved without one.",
    );
    expect(mockDb.rows(schema.event)[0]?.name).toBe("Xmas");
  });

  it("updates other fields when the patch omits the date", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { name: "Xmas 2026" })).resolves.toMatchObject({
      name: "Xmas 2026",
      occursOn: "2026-01-01",
    });
  });

  it("returns the same row when the patch is empty", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    const event = makeEvent();
    await expect(updateEdition(event, {})).resolves.toEqual(event);
  });

  it("returns the original event when the update matches no row", async () => {
    const event = makeEvent({
      id: 9,
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    await expect(updateEdition(event, { name: "Missing" })).resolves.toEqual(event);
  });

  it("refuses an amount that does not include every currency", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "amount",
      budget: 20,
      currency: "EUR",
      budgetEur: 20,
      budgetPln: 90,
      budgetJpy: 3000,
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { budgetKind: "amount", budget: 25, currency: "EUR" }),
    ).rejects.toThrow("EUR, PLN, and JPY amounts are required.");
    expect(mockDb.rows(schema.event)[0]?.budget).toBe(20);
  });

  it("stores make-the-gift and no-limit with empty amounts", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "amount",
      budget: 20,
      currency: "EUR",
      budgetEur: 20,
      budgetPln: 80,
      budgetJpy: 3000,
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { budgetKind: "zero" }),
    ).resolves.toMatchObject({
      budgetKind: "zero",
      budget: null,
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    });
    await expect(
      updateEdition(
        { ...event, budgetKind: "zero", budget: null, budgetEur: null, budgetPln: null, budgetJpy: null },
        { budgetKind: "unlimited" },
      ),
    ).resolves.toMatchObject({
      budgetKind: "unlimited",
      budget: null,
    });
  });

  it("refuses to save while no budget choice is stored", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { name: "Later" })).rejects.toThrow(
      "Choose a budget, make-the-gift, or no spending limit.",
    );
    expect(mockDb.rows(schema.event)[0]?.name).toBe("Xmas");
  });

  it("refuses an amount choice that clears the number", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "amount",
      budget: 20,
      currency: "EUR",
      budgetEur: 20,
      budgetPln: 80,
      budgetJpy: 3000,
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { budgetKind: "amount", budget: null, currency: "EUR" }),
    ).rejects.toThrow("Enter a budget amount.");
    expect(mockDb.rows(schema.event)[0]?.budget).toBe(20);
  });

  it("refuses a zero amount", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, {
        budgetKind: "amount",
        budget: 0,
        currency: "EUR",
        budgetEur: 0,
        budgetPln: 0,
        budgetJpy: 0,
      }),
    ).rejects.toThrow(
      "Zero is not a budget amount. Choose make-the-gift if guests should not spend money.",
    );
  });

  it("refuses a write that would leave translations missing", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ nameDe: "Weihnachten" })]);
    await expect(
      updateEdition(makeEvent({ nameDe: "Weihnachten" }), { budget: 12 }),
    ).rejects.toThrow(
      "Enter the missing event name translations: Polish, Spanish, Japanese.",
    );
  });

  it("saves when the merged row already has every translation", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { name: "Xmas" })).resolves.toMatchObject({
      name: "Xmas",
      ...eventNameTranslations(),
    });
  });

  it("refuses a write that would leave a Polish case missing", async () => {
    const event = makeEvent({ ...eventNameTranslations() });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { budget: 12 })).rejects.toThrow(
      "Enter the missing Polish cases for the event name: Dopełniacz, Celownik, Biernik, Narzędnik, Miejscownik, Wołacz.",
    );
    expect(mockDb.rows(schema.event)[0]?.budget).toBeNull();
  });

  it("refuses to clear one Polish case", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { nameWolacz: "  " })).rejects.toThrow(
      "Enter the missing Polish cases for the event name: Wołacz.",
    );
    expect(mockDb.rows(schema.event)[0]?.nameWolacz).toBe("Święta");
  });

  it("saves when the merged row already has every Polish case", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { nameDopelniacz: "Świąt" }),
    ).resolves.toMatchObject({
      nameDopelniacz: "Świąt",
      nameWolacz: "Święta",
    });
  });

  it("refuses to clear a translation when the others are set", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { nameDe: "  " })).rejects.toThrow(
      "Enter the missing event name translations: German.",
    );
    expect(mockDb.rows(schema.event)[0]?.nameDe).toBe("Weihnachten");
  });

  it("stores a trimmed location and the Polish gdzie? phrase", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, {
        location: "  Katowice ",
        locationGdzie: " w Katowicach",
      }),
    ).resolves.toMatchObject(eventLocation());
    expect(mockDb.rows(schema.event)[0]).toMatchObject(eventLocation());
  });

  it("refuses to clear both location fields", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { location: "   ", locationGdzie: "" }),
    ).rejects.toThrow(
      "Enter the missing location: place name, Polish phrase (gdzie?).",
    );
    expect(mockDb.rows(schema.event)[0]).toMatchObject(eventLocation());
  });

  it("refuses to clear only the place name", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { location: "" })).rejects.toThrow(
      "Enter the missing location: place name.",
    );
    expect(mockDb.rows(schema.event)[0]).toMatchObject(eventLocation());
  });

  it("refuses a whitespace-only Polish gdzie? phrase", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      ...eventLocation(),
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { locationGdzie: "  " }),
    ).rejects.toThrow("Enter the missing location: Polish phrase (gdzie?).");
    expect(mockDb.rows(schema.event)[0]).toMatchObject(eventLocation());
  });

  it("refuses other edits while the stored location is incomplete", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      location: "Katowice",
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(updateEdition(event, { name: "Later" })).rejects.toThrow(
      "Enter the missing location: Polish phrase (gdzie?).",
    );
    expect(mockDb.rows(schema.event)[0]?.name).toBe("Xmas");
  });

  it("completes a half-filled location", async () => {
    const event = makeEvent({
      ...eventNameTranslations(),
      ...polishNameCases("Święta"),
      location: "Katowice",
      budgetKind: "unlimited",
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    await expect(
      updateEdition(event, { locationGdzie: "w Katowicach" }),
    ).resolves.toMatchObject(eventLocation());
  });
});

describe("hasEarlierEdition", () => {
  it("is false when the series only has later editions", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2026-11-13", code: "shop_2026" }),
      makeEvent({ id: 2, occursOn: "2027-11-13", code: "shop_2027" }),
    ]);
    await expect(
      hasEarlierEdition(1, { id: 1, occursOn: "2026-11-13" }),
    ).resolves.toBe(false);
  });

  it("is true when another edition occurs on an earlier date", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2025-11-13", code: "shop_2025" }),
      makeEvent({ id: 2, occursOn: "2026-11-13", code: "shop_2026" }),
    ]);
    await expect(
      hasEarlierEdition(1, { id: 2, occursOn: "2026-11-13" }),
    ).resolves.toBe(true);
  });
});
