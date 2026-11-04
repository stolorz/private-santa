import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  eventLocation,
  eventNameTranslations,
  makeDraw,
  polishNameCases,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { NextRequest } from "next/server";
import { DELETE, GET, PATCH } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

describe("/api/events/[code]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent(),
      makeEvent({
        id: 2,
        seriesId: 2,
        code: "office_20260101",
        ...eventNameTranslations(),
        ...polishNameCases("Święta"),
        ...eventLocation(),
        budgetKind: "unlimited",
      }),
    ]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await PATCH(
      jsonRequest("/api/events/office_20260101", { name: "Pals" }, { method: "PATCH" }),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(401);
    const getRes = await GET(
      new NextRequest("http://localhost/api/events/office_20260101"),
      codeParams("office_20260101"),
    );
    expect(getRes.status).toBe(401);
  });

  it("returns deletion impact for an edition", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 2, personId: 1 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, eventId: 2, status: "completed" }),
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/events/office_20260101"),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      event: { code: "office_20260101" },
      series: { name: "Office" },
      impact: {
        guests: 1,
        wishlists: 0,
        exclusions: 0,
        draftDraws: 0,
        completedDraws: 1,
        otherEditions: 0,
      },
      guests: [{ personId: 1, name: "Person 1", exclusive: true }],
    });
  });

  it("accepts decimal budget amounts", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        {
          budgetKind: "amount",
          budget: 6.8,
          currency: "EUR",
          budgetEur: 6.8,
          budgetPln: 30,
          budgetJpy: 1200,
        },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      budget: 6.8,
      currency: "EUR",
      budgetEur: 6.8,
      budgetPln: 30,
      budgetJpy: 1200,
    });
  });

  it("stores 1.1 without truncating to 1", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        {
          budgetKind: "amount",
          budget: 1.1,
          currency: "EUR",
          budgetEur: 1.1,
          budgetPln: 4.8,
          budgetJpy: 190,
        },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      budget: 1.1,
      budgetEur: 1.1,
      budgetPln: 4.8,
      budgetJpy: 190,
    });
  });

  it("updates budget and currency", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        {
          budgetKind: "amount",
          budget: 25,
          currency: "PLN",
          budgetEur: 5,
          budgetPln: 25,
          budgetJpy: 900,
        },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      budget: 25,
      currency: "PLN",
      budgetEur: 5,
      budgetPln: 25,
      budgetJpy: 900,
      code: "office_20260101",
    });
  });

  it("rejects a budget without EUR, PLN, and JPY amounts", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { budgetKind: "amount", budget: 25, currency: "PLN" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "EUR, PLN, and JPY amounts are required.",
    });
  });

  it("rejects a primary amount that does not match its currency", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        {
          budgetKind: "amount",
          budget: 25,
          currency: "PLN",
          budgetEur: 5,
          budgetPln: 24,
          budgetJpy: 900,
        },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Primary budget must match its currency amount.",
    });
  });

  it("clears converted amounts when the choice is no spending limit", async () => {
    mockDb.seed(schema.event, [
      makeEvent(),
      makeEvent({
        id: 2,
        seriesId: 2,
        code: "office_20260101",
        budgetKind: "amount",
        budget: 25,
        currency: "PLN",
        budgetEur: 5,
        budgetPln: 25,
        budgetJpy: 900,
        ...eventNameTranslations(),
        ...polishNameCases("Święta"),
        ...eventLocation(),
      }),
    ]);

    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { budgetKind: "unlimited" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      budgetKind: "unlimited",
      budget: null,
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    });
  });

  it("rejects an unknown currency", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { currency: "XXX" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
  });

  it("updates English, German, Spanish, and Japanese names", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        {
          nameEn: " Office party ",
          nameDe: " Büroparty ",
          nameEs: " Fiesta de oficina ",
          nameJa: " オフィスパーティ ",
        },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      nameEn: "Office party",
      nameDe: "Büroparty",
      nameEs: "Fiesta de oficina",
      nameJa: "オフィスパーティ",
      code: "office_20260101",
    });
  });

  it("refuses to clear a language overlay", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { nameDe: "  " },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing event name translations: German.",
    });
  });

  it("updates the Polish name and a case when the others stay filled", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        {
          namePl: " Rodzinne Święta ",
          nameDopelniacz: " Rodzinnych Świąt ",
        },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      namePl: "Rodzinne Święta",
      nameDopelniacz: "Rodzinnych Świąt",
      nameWolacz: "Święta",
      code: "office_20260101",
    });
  });

  it("refuses to clear a Polish case", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { nameWolacz: "" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing Polish cases for the event name: Wołacz.",
    });
    expect(
      mockDb.rows(schema.event).find((row) => row.code === "office_20260101")
        ?.nameWolacz,
    ).toBe("Święta");
  });

  it("refuses to clear the Polish overlay", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { namePl: "  " },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing event name translations: Polish.",
    });
  });

  it("updates an edition name without changing the code", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { name: "office-test" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      name: "office-test",
      code: "office_20260101",
    });
  });

  it("updates the place and the Polish gdzie? phrase", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { location: " Wrocław ", locationGdzie: "we Wrocławiu" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      location: "Wrocław",
      locationGdzie: "we Wrocławiu",
    });
  });

  it("refuses to clear the Polish gdzie? phrase", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { locationGdzie: "  " },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing location: Polish phrase (gdzie?).",
    });
    expect(
      mockDb.rows(schema.event).find((row) => row.code === "office_20260101"),
    ).toMatchObject(eventLocation());
  });

  it("rejects a location that is not a string", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { location: 12 },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid event data." });
  });

  it("updates the party date", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { occursOn: "2026-12-24" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      occursOn: "2026-12-24",
      code: "office_20260101",
    });
  });

  it("refuses to clear the party date", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { occursOn: "" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "Enter the event date. Guest messages will include it, so these details cannot be saved without one.",
    });
    expect(
      mockDb.rows(schema.event).find((row) => row.code === "office_20260101")
        ?.occursOn,
    ).toBe("2026-01-01");
  });

  it("rejects an invalid party date", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/events/office_20260101",
        { occursOn: "2026-13-01" },
        { method: "PATCH" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
  });

  it("reports completed draws so the UI can refuse deletion", async () => {
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, eventId: 2, status: "completed" }),
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/events/office_20260101"),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      impact: { completedDraws: 1, draftDraws: 0 },
    });
  });

  it("rejects deleting an edition that has completed draws", async () => {
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, eventId: 2, status: "completed" }),
    ]);

    const res = await DELETE(
      jsonRequest("/api/events/office_20260101", {}, { method: "DELETE" }),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Cannot delete an edition that has completed draws.",
    });
  });

  it("deletes an empty extra edition", async () => {
    const res = await DELETE(
      jsonRequest("/api/events/office_20260101", {}, { method: "DELETE" }),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.event).map((e) => e.code)).toEqual(["xmas_20260101"]);
  });

  it("keeps people when deletePersonIds is omitted", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 2, personId: 1 }),
    ]);

    const res = await DELETE(
      jsonRequest("/api/events/office_20260101", {}, { method: "DELETE" }),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.event).map((e) => e.code)).toEqual(["xmas_20260101"]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1]);
    expect(mockDb.rows(schema.guest)).toEqual([]);
  });

  it("deletes exclusive people listed in deletePersonIds", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 2, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 2 }),
    ]);

    const res = await DELETE(
      jsonRequest(
        "/api/events/office_20260101",
        { deletePersonIds: [1] },
        { method: "DELETE" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.event).map((e) => e.code)).toEqual(["xmas_20260101"]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2]);
  });

  it("rejects deleting a person who is also in another event", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    const res = await DELETE(
      jsonRequest(
        "/api/events/office_20260101",
        { deletePersonIds: [1] },
        { method: "DELETE" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Cannot delete a guest who is in another event.",
    });
    expect(mockDb.rows(schema.event).map((e) => e.code).sort()).toEqual([
      "office_20260101",
      "xmas_20260101",
    ]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1]);
  });

  it("rejects deleting a person who is not a guest of this event", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    const res = await DELETE(
      jsonRequest(
        "/api/events/office_20260101",
        { deletePersonIds: [1] },
        { method: "DELETE" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Cannot delete a guest who is not in this event.",
    });
    expect(mockDb.rows(schema.event).map((e) => e.code).sort()).toEqual([
      "office_20260101",
      "xmas_20260101",
    ]);
  });

  it("rejects non-integer deletePersonIds", async () => {
    const res = await DELETE(
      jsonRequest(
        "/api/events/office_20260101",
        { deletePersonIds: [1.5] },
        { method: "DELETE" },
      ),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid event data." });
    expect(mockDb.rows(schema.event).map((e) => e.code).sort()).toEqual([
      "office_20260101",
      "xmas_20260101",
    ]);
  });

  it("lists exclusive and shared guests on GET", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 2, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 2 }),
      makeGuest({ id: 3, eventId: 1, personId: 2 }),
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/events/office_20260101"),
      codeParams("office_20260101"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      guests: [
        { personId: 1, name: "Ada", exclusive: true },
        { personId: 2, name: "Bea", exclusive: false },
      ],
    });
  });
});
