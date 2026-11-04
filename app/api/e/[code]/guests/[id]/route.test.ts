import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeGuest,
  makeGuestView,
  makePerson,
  makeSeries,
  makeUser,
  polishNameCases,
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

import * as people from "@/lib/people";
import { guestById } from "@/lib/people";
import { NextRequest } from "next/server";
import { DELETE, PUT } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


function params(id: string) {
  return codeParams(FIXTURE_EVENT_CODE, { id });
}

function putBody(body: Record<string, unknown> = {}) {
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name : "Ada";
  return { gender: "female", ...polishNameCases(name), ...body };
}

describe("PUT /api/e/[code]/guests/[id]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await PUT(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/1`, putBody({ name: "Ada" }), { method: "PUT" }),
      params("1"),
    );

    expect(res.status).toBe(401);
  });

  it("rejects a NaN id", async () => {
    const res = await PUT(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/abc`, putBody({ name: "Ada" }), { method: "PUT" }),
      params("abc"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid id." });
  });

  it("rejects linking a user account that does not exist", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ userId: "missing" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That user account does not exist.",
    });
  });

  it("rejects a user already linked to another person", async () => {
    mockDb.seed(schema.user, [makeUser({ id: "user_2" })]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, userId: null }),
      makePerson({ id: 2, userId: "user_2" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ userId: "user_2" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That account is already linked.",
    });
  });

  it("returns 404 when the guest is missing", async () => {
    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/9`,
        putBody({ name: "Ada" }),
        { method: "PUT" },
      ),
      params("9"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the guest disappears after save", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
    const spy = vi
      .spyOn(people, "guestInEdition")
      .mockResolvedValueOnce(makeGuestView({ id: 1, personId: 1 }))
      .mockResolvedValueOnce(undefined);
    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ name: "Ada" }),
        { method: "PUT" },
      ),
      params("1"),
    );
    expect(res.status).toBe(404);
    spy.mockRestore();
  });

  it("stores an empty phone as null on the person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, phone: "351912345678" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/1`, putBody({ phone: "" }), { method: "PUT" }),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 1,
      phone: null,
    });
    expect(mockDb.rows(schema.person)[0].phone).toBeNull();
  });

  it("updates name, phone and email on the person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Old", phone: "351911111111", email: "old@example.com" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({
          name: "Ada",
          phone: "351912345678",
          email: "Ada@Example.com",
        }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
    });
  });

  it("applies email changes to the same person in other events", async () => {
    mockDb.add(
      schema.event,
      makeEvent({ id: 2, seriesId: 1, code: "event_2_20260101" }),
    );
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", email: "old@example.com" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ email: "new@example.com" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(guestById(2)).resolves.toMatchObject({
      id: 2,
      eventId: 2,
      personId: 1,
      name: "Ada",
      email: "new@example.com",
    });
  });

  it("stores an empty email as null without clearing the linked login email", async () => {
    mockDb.seed(schema.user, [
      makeUser({ id: "user_1", email: "login@example.com" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        email: "ada@example.com",
        userId: "user_1",
      }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ email: "" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 1,
      email: null,
    });
    expect(mockDb.rows(schema.person)[0].email).toBeNull();
    expect(mockDb.rows(schema.user)[0].email).toBe("login@example.com");
  });

  it("updates language on the person", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, language: "en" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ language: "pl" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ language: "pl" });
    expect(mockDb.rows(schema.person)[0].language).toBe("pl");
  });

  it("sets gender and refuses to clear it", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, gender: null })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const setRes = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ gender: "female" }),
        { method: "PUT" },
      ),
      params("1"),
    );
    expect(setRes.status).toBe(200);
    await expect(setRes.json()).resolves.toMatchObject({ gender: "female" });

    const clearRes = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ gender: null }),
        { method: "PUT" },
      ),
      params("1"),
    );
    expect(clearRes.status).toBe(400);
    await expect(clearRes.json()).resolves.toEqual({
      error: "Gender is required.",
    });
    expect(mockDb.rows(schema.person)[0]?.gender).toBe("female");
  });

  it("refuses a guest save that omits gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, gender: "male", ...polishNameCases("Ada") }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
    const { gender: _gender, ...body } = putBody();

    const res = await PUT(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/1`, body, {
        method: "PUT",
      }),
      params("1"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Gender is required.",
    });
    expect(mockDb.rows(schema.person)[0]?.gender).toBe("male");
  });

  it("refuses to clear a Polish case", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Anna",
        ...polishNameCases("Anna"),
      }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({
          name: "Anna",
          nameDopelniacz: "Anny Kowalskiej",
          nameWolacz: "",
        }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing Polish cases: Wołacz.",
    });
    expect(mockDb.rows(schema.person)[0]).toMatchObject({
      nameDopelniacz: "Anna",
      nameWolacz: "Anna",
    });
  });

  it("allows an email already used by another person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, email: "ada@example.com" }),
      makePerson({ id: 2, email: "bea@example.com" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ email: "bea@example.com" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 1,
      email: "bea@example.com",
    });
    expect(mockDb.rows(schema.person).map((p) => p.email)).toEqual([
      "bea@example.com",
      "bea@example.com",
    ]);
  });

  it("allows a phone already used by another person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, phone: "351911111111" }),
      makePerson({ id: 2, phone: "351912345678" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1`,
        putBody({ phone: "351912345678" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 1,
      phone: "351912345678",
    });
  });
});

describe("DELETE /api/e/[code]/guests/[id]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  function deleteRequest(id: string, scope?: string) {
    const query = scope ? `?scope=${scope}` : "";
    return new NextRequest(
      `http://localhost/api/e/${FIXTURE_EVENT_CODE}/guests/${id}${query}`,
      { method: "DELETE" },
    );
  }

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await DELETE(deleteRequest("1"), params("1"));
    expect(res.status).toBe(401);
  });

  it("rejects a NaN id", async () => {
    const res = await DELETE(deleteRequest("abc"), params("abc"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid id." });
  });

  it("rejects an unknown scope", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await DELETE(deleteRequest("1", "all"), params("1"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid scope." });
    expect(mockDb.rows(schema.guest)).toHaveLength(1);
  });

  it("rejects a guest from another event", async () => {
    mockDb.add(
      schema.event,
      makeEvent({ id: 2, seriesId: 1, code: "event_2_20260101" }),
    );
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 2, personId: 1 })]);

    const res = await DELETE(deleteRequest("1"), params("1"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Guest not found." });
    expect(mockDb.rows(schema.guest)).toHaveLength(1);
  });

  it("removes the guest from this event by default", async () => {
    mockDb.add(
      schema.event,
      makeEvent({ id: 2, seriesId: 1, code: "event_2_20260101" }),
    );
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    const res = await DELETE(deleteRequest("1"), params("1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([2]);
    expect(mockDb.rows(schema.person)).toHaveLength(1);
  });

  it("deletes the person from the database when scope is person", async () => {
    mockDb.add(
      schema.event,
      makeEvent({ id: 2, seriesId: 1, code: "event_2_20260101" }),
    );
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
      makeGuest({ id: 3, eventId: 1, personId: 2 }),
    ]);

    const res = await DELETE(deleteRequest("1", "person"), params("1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([3]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2]);
  });
});
