import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
  polishNameCases,
} from "@/test/helpers/fixtures";
import { codeParams, emptyRequest, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { GET, POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";
import * as people from "@/lib/people";


describe("GET /api/e/[code]/guests", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`),
      codeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns an empty list", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns guests sorted by name", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Cyd" }),
      makePerson({ id: 2, name: "Ada" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);

    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((g: { name: string }) => g.name)).toEqual(["Ada", "Cyd"]);
  });
});

function guestBody(body: Record<string, unknown> = {}) {
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name : "Ada";
  return { gender: "female", ...polishNameCases(name), ...body };
}

describe("POST /api/e/[code]/guests", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ name: "Ada" })),
      codeParams(),
    );

    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ name: "" })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid guest data.",
    });
  });

  it("creates a person and a guest seat", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        phone: "351912345678",
        email: "Ada@Example.com",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
      eventId: 1,
    });
  });

  it("rejects an invalid email", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        email: "not-an-email",
      })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email address.",
    });
  });

  it("creates a second person when names differ but the phone is shared", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", phone: "351912345678", userId: "user_ada" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada Lovelace",
        phone: "351912345678",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada Lovelace",
      phone: "351912345678",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("creates a second person when names differ but the email is shared", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", email: "ada@example.com" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada Lovelace",
        email: "ada@example.com",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("reuses a unique name even when the email is already used", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351912345678", email: null }),
      makePerson({ id: 2, name: "Bea", email: "bea@example.com" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        phone: "351912345678",
        email: "bea@example.com",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      personId: 1,
      name: "Ada",
      email: "bea@example.com",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("refuses to merge a contactless namesake", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", phone: "351912345678" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ name: "ada" })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "A person named Ada already exists. Choose them from the list, or add a phone or email.",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(1);
    expect(mockDb.rows(schema.guest)).toHaveLength(0);
  });

  it("reuses an existing person when the phone matches", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", phone: "351912345678" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "ada",
        phone: "351912345678",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      personId: 5,
      name: "Ada",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(1);
  });

  it("creates a new person when createNew is set", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", phone: null, email: null }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        createNew: true,
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.personId).not.toBe(5);
    expect(body.name).toBe("Ada");
    expect(mockDb.rows(schema.person)).toHaveLength(2);
    expect(mockDb.rows(schema.person).map((person) => person.phone)).toEqual([
      null,
      null,
    ]);
  });

  it("rejects a person already seated in this edition", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351912345678" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        phone: "351912345678",
      })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That person is already a guest of this edition.",
    });
  });

  it("adds a second guest who shares a seated person's phone", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351912345678" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Bea",
        phone: "351912345678",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Bea",
      phone: "351912345678",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(2);
    expect(mockDb.rows(schema.guest)).toHaveLength(2);
  });

  it("stores a language on a new person", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        language: "pl",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada",
      language: "pl",
    });
    expect(mockDb.rows(schema.person)[0].language).toBe("pl");
  });

  it("stores name cases on a new person", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Anna",
        nameDopelniacz: "Anny",
        nameWolacz: "Anno",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Anna",
      nameDopelniacz: "Anny",
      nameWolacz: "Anno",
      nameCelownik: "Anna",
    });
    expect(mockDb.rows(schema.person)[0]).toMatchObject({
      nameDopelniacz: "Anny",
      nameWolacz: "Anno",
    });
  });

  it("rejects a new guest who is missing a Polish case", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Anna",
        nameWolacz: "",
      })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing Polish cases: Wołacz.",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(0);
  });

  it("rejects seating an existing person who is missing a Polish case", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 5, name: "Ada" })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        personId: 5,
        nameBiernik: " ",
      })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing Polish cases: Biernik.",
    });
    expect(mockDb.rows(schema.guest)).toHaveLength(0);
  });

  it("rejects an unknown language", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        language: "zz",
      })),
      codeParams(),
    );

    expect(res.status).toBe(400);
  });

  it("seats an existing person by id without creating another", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", phone: "351912345678" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ personId: 5 })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      personId: 5,
      name: "Ada",
      phone: "351912345678",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(1);
    expect(mockDb.rows(schema.person)[0]).toMatchObject(polishNameCases("Ada"));
    expect(mockDb.rows(schema.guest)).toHaveLength(1);
  });

  it("rejects an unknown personId", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ personId: 99 })),
      codeParams(),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Unknown person." });
  });

  it("rejects a personId already seated in this edition", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ personId: 1 })),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That person is already a guest of this edition.",
    });
  });

  it("updates language when seating an existing person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", language: "en" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        personId: 5,
        language: "pl",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      personId: 5,
      language: "pl",
    });
    expect(mockDb.rows(schema.person)[0].language).toBe("pl");
  });

  it("refuses a new guest with a null or omitted gender", async () => {
    const { gender: _gender, ...missing } = guestBody({ name: "Ada" });
    for (const body of [guestBody({ name: "Ada", gender: null }), missing]) {
      const res = await POST(
        jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, body),
        codeParams(),
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Gender is required.",
      });
    }
    expect(mockDb.rows(schema.person)).toHaveLength(0);
  });

  it("rejects seating an existing person with a null or omitted gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", gender: "female" }),
    ]);
    const { gender: _gender, ...missing } = guestBody({ personId: 5 });
    for (const body of [guestBody({ personId: 5, gender: null }), missing]) {
      const res = await POST(
        jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, body),
        codeParams(),
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Gender is required.",
      });
    }
    expect(mockDb.rows(schema.guest)).toHaveLength(0);
  });

  it("stores gender on a new person", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        name: "Ada",
        gender: "female",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada",
      gender: "female",
    });
  });

  it("updates gender when seating an existing person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 5, name: "Ada", gender: null }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({
        personId: 5,
        gender: "male",
      })),
      codeParams(),
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      personId: 5,
      gender: "male",
    });
    expect(mockDb.rows(schema.person)[0].gender).toBe("male");
  });

  it("falls back to the seat when the guest view is missing", async () => {
    vi.spyOn(people, "guestById").mockResolvedValueOnce(undefined);
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests`, guestBody({ name: "Ada" })),
      codeParams(),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      eventId: 1,
      personId: expect.any(Number),
    });
  });
});
