import { describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
  makeUser,
  polishNameCases,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { db } from "@/lib/db";
import * as libDb from "@/lib/db";
import { GENDER_REQUIRED_MESSAGE } from "@/lib/gender";
import {
  addGuestToEvent,
  assertLinkableUser,
  findOrCreatePerson,
  insertOrganiserPerson,
  guestEmailById,
  guestsBelongToEvent,
  guestsForEvent,
  listPeopleWithEvents,
  normalizeEmail,
  otherEventSeatCounts,
  peopleExclusiveToEvent,
  PersonError,
  removeGuest,
  removePerson,
  setPersonPhoto,
  updatePerson,
} from "@/lib/people";
import { contactSchema } from "@/lib/schemas";
import { normalizeName } from "@/lib/person-name";

describe("insertOrganiserPerson", () => {
  it("stores the normalized name and leaves gender and cases empty", () => {
    mockDb.seed(schema.user, [
      makeUser({ id: "user_ada", name: "Ada Lovelace", email: "ada@example.com" }),
    ]);
    insertOrganiserPerson("user_ada", {
      name: "  Ada   Lovelace ",
      phone: null,
      email: "ada@example.com",
    });

    expect(mockDb.rows(schema.person)).toEqual([
      expect.objectContaining({
        userId: "user_ada",
        name: "  Ada   Lovelace ",
        nameNormalized: "ada lovelace",
        phone: null,
        email: "ada@example.com",
        gender: null,
        nameDopelniacz: null,
        nameCelownik: null,
        nameBiernik: null,
        nameNarzednik: null,
        nameMiejscownik: null,
        nameWolacz: null,
      }),
    ]);
  });
});

describe("normalizeEmail", () => {
  it("trims, lowercases, and treats blank as null", () => {
    expect(normalizeEmail(" Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("contactSchema", () => {
  it("leaves omitted fields undefined", () => {
    expect(contactSchema.parse({})).toEqual({});
  });

  it("rejects a phone with no digits", () => {
    const parsed = contactSchema.safeParse({ phone: "abc" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Invalid phone number.");
    }
  });

  it("rejects a malformed email", () => {
    const parsed = contactSchema.safeParse({ email: "not-an-email" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Invalid email address.");
    }
  });

  it("normalizes phone digits and email case", () => {
    expect(
      contactSchema.parse({
        phone: "+351 912 345 678",
        email: "Ada@Example.COM",
      }),
    ).toEqual({
      phone: "351912345678",
      email: "ada@example.com",
    });
  });
});

function personInput(
  name: string,
  extra: Partial<Parameters<typeof findOrCreatePerson>[0]> = {},
) {
  return {
    name,
    phone: null,
    email: null,
    gender: "female" as const,
    ...polishNameCases(name),
    ...extra,
  };
}

describe("findOrCreatePerson", () => {
  it("creates a person with name, phone and email", async () => {
    const { person, created } = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351912345678",
        email: "ada@example.com",
      }),
    );

    expect(created).toBe(true);
    expect(person).toMatchObject({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
      language: "pl",
    });
  });

  it("stores a language on create and updates it on reuse", async () => {
    const created = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351912345678",
        language: "pl",
      }),
    );
    expect(created.person.language).toBe("pl");

    const reused = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351912345678",
        language: "ja",
      }),
    );
    expect(reused.created).toBe(false);
    expect(reused.person.language).toBe("ja");
  });

  it("stores gender on create and updates it on reuse", async () => {
    const created = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351911111111",
        gender: "female",
      }),
    );
    expect(created.person.gender).toBe("female");

    const reused = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351911111111",
        gender: "male",
      }),
    );
    expect(reused.created).toBe(false);
    expect(reused.person.gender).toBe("male");
  });

  it("fills a missing email when the same unique name is reused", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351912345678", email: null }),
      makePerson({ id: 2, name: "Bea", email: "ada@example.com" }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351912345678",
        email: "ada@example.com",
      }),
    );

    expect(created).toBe(false);
    expect(person).toMatchObject({
      id: 1,
      name: "Ada",
      email: "ada@example.com",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("returns a complete person unchanged when nothing new is offered", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        phone: "351912345678",
        email: "ada@example.com",
        language: "pl",
        gender: "female",
        ...polishNameCases("Ada"),
      }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351912345678",
        email: "ada@example.com",
        language: "pl",
      }),
    );

    expect(created).toBe(false);
    expect(person.id).toBe(1);
    expect(mockDb.updates).toHaveLength(0);
  });

  it("refuses to create a person who is missing a Polish case", async () => {
    await expect(
      findOrCreatePerson(
        personInput("Anna", {
          nameWolacz: " ",
        }),
      ),
    ).rejects.toThrow("Enter the missing Polish cases: Wołacz.");
    expect(mockDb.rows(schema.person)).toHaveLength(0);
  });

  it("stores name cases on create", async () => {
    const { person, created } = await findOrCreatePerson(
      personInput("Anna", {
        nameDopelniacz: "Anny",
        nameWolacz: "Anno",
      }),
    );

    expect(created).toBe(true);
    expect(person).toMatchObject({
      name: "Anna",
      nameDopelniacz: "Anny",
      nameWolacz: "Anno",
      nameCelownik: "Anna",
    });
  });

  it("fills empty name cases on reuse without overwriting", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Anna",
        phone: "351912345678",
        nameDopelniacz: "Anny",
      }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("Anna", {
        phone: "351912345678",
        nameDopelniacz: "Other",
        nameWolacz: "Anno",
      }),
    );

    expect(created).toBe(false);
    expect(person).toMatchObject({
      id: 1,
      nameDopelniacz: "Anny",
      nameWolacz: "Anno",
    });
  });

  it("creates a person when names differ even if phone and email are already used", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351912345678" }),
      makePerson({ id: 2, name: "Bea", email: "bea@example.com" }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("Cyd", {
        phone: "351912345678",
        email: "bea@example.com",
      }),
    );

    expect(created).toBe(true);
    expect(person).toMatchObject({
      name: "Cyd",
      phone: "351912345678",
      email: "bea@example.com",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(3);
  });

  it("reuses a unique name and fills a missing phone", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: null, email: null }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("ada", {
        phone: "351912345678",
        email: "ada@example.com",
      }),
    );

    expect(created).toBe(false);
    expect(person).toMatchObject({
      id: 1,
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
    });
    expect(mockDb.rows(schema.person)).toHaveLength(1);
  });

  it("creates a second person when the same name has a different phone", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351911111111" }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("Ada", {
        phone: "351922222222",
      }),
    );

    expect(created).toBe(true);
    expect(person.id).not.toBe(1);
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("throws when several people share a compatible name", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: null }),
      makePerson({ id: 2, name: "Ada", phone: null }),
    ]);

    await expect(
      findOrCreatePerson({ name: "Ada", phone: null, email: null }),
    ).rejects.toThrow(/share that name/);
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("refuses when a supplied email still matches several people", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", email: null }),
      makePerson({ id: 2, name: "Ada", email: null }),
    ]);

    await expect(
      findOrCreatePerson(personInput("Ada", { email: "ada@example.com" })),
    ).rejects.toThrow(/share that name/);
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });

  it("refuses to merge a contactless name into the one namesake", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: "351912345678" }),
    ]);

    await expect(findOrCreatePerson(personInput("ada"))).rejects.toThrow(
      "A person named Ada already exists. Choose them from the list, or add a phone or email.",
    );
    expect(mockDb.rows(schema.person)).toHaveLength(1);
    expect(mockDb.updates).toHaveLength(0);
  });

  it("creates a second person when createNew is set", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: null, email: null }),
    ]);

    const { person, created } = await findOrCreatePerson(
      personInput("Ada", { createNew: true }),
    );

    expect(created).toBe(true);
    expect(person.id).not.toBe(1);
    expect(person.phone).toBeNull();
    expect(mockDb.rows(schema.person)).toHaveLength(2);
  });
});

describe("normalizeName", () => {
  it("trims, collapses spaces, and lowercases", () => {
    expect(normalizeName("  Ada   Lovelace ")).toBe("ada lovelace");
  });
});

describe("otherEventSeatCounts", () => {
  it("counts seats in other editions for the given people", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
      makeGuest({ id: 3, eventId: 3, personId: 1 }),
      makeGuest({ id: 4, eventId: 1, personId: 2 }),
    ]);

    await expect(otherEventSeatCounts(1)).resolves.toEqual({
      1: 2,
      2: 0,
    });
    await expect(otherEventSeatCounts(1, [1, 1, 2])).resolves.toEqual({
      1: 2,
      2: 0,
    });
  });

  it("returns empty counts when the edition has no guests", async () => {
    await expect(otherEventSeatCounts(1)).resolves.toEqual({});
  });

  it("starts the count at zero when a seat person was not pre-seeded", async () => {
    const orig = db.select.bind(db);
    vi.spyOn(db, "select").mockImplementation((fields?: Record<string, unknown>) => {
      const builder = orig(fields as never);
      if (fields && "eventId" in fields && "personId" in fields) {
        const origFrom = builder.from.bind(builder);
        builder.from = ((table: unknown) => {
          const fromBuilder = origFrom(table as never);
          fromBuilder.where = () =>
            Promise.resolve([
              { personId: 1, eventId: 2 },
              { personId: 99, eventId: 2 },
            ]) as never;
          return fromBuilder;
        }) as typeof builder.from;
      }
      return builder;
    });
    await expect(otherEventSeatCounts(1, [1])).resolves.toEqual({ 1: 1, 99: 1 });
  });
});

describe("peopleExclusiveToEvent", () => {
  it("returns empty groups when no ids are given", () => {
    expect(peopleExclusiveToEvent(1, [])).toEqual({
      exclusive: [],
      notSeated: [],
      shared: [],
    });
  });

  it("marks a person seated only in this event as exclusive", () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 1, personId: 1 })]);

    expect(peopleExclusiveToEvent(1, [1])).toEqual({
      exclusive: [1],
      notSeated: [],
      shared: [],
    });
  });

  it("marks a person seated in another edition of the same series as shared", () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, seriesId: 1, code: "xmas_2025" }),
      makeEvent({ id: 2, seriesId: 1, code: "xmas_2026" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    expect(peopleExclusiveToEvent(1, [1])).toEqual({
      exclusive: [],
      notSeated: [],
      shared: [1],
    });
  });

  it("marks a person seated in another series as shared", () => {
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, seriesId: 1 }),
      makeEvent({ id: 2, seriesId: 2, code: "office_20260101" }),
    ]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    expect(peopleExclusiveToEvent(1, [1])).toEqual({
      exclusive: [],
      notSeated: [],
      shared: [1],
    });
  });

  it("marks unknown ids and people not seated in this event as notSeated", () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 2, personId: 1 })]);

    expect(peopleExclusiveToEvent(1, [1, 2, 99])).toEqual({
      exclusive: [],
      notSeated: [1, 2, 99],
      shared: [],
    });
  });

  it("classifies a mixed list and collapses duplicate ids", () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cyd" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 3, eventId: 2, personId: 2 }),
      makeGuest({ id: 4, eventId: 3, personId: 3 }),
    ]);

    expect(peopleExclusiveToEvent(1, [2, 1, 1, 3, 99, 2])).toEqual({
      exclusive: [1],
      notSeated: [3, 99],
      shared: [2],
    });
  });
});

describe("removeGuest", () => {
  it("returns not_found when the seat is in another event", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, eventId: 2, personId: 1 })]);

    await expect(removeGuest(1, 1, "event")).resolves.toBe("not_found");
    expect(mockDb.rows(schema.guest)).toHaveLength(1);
    expect(mockDb.rows(schema.person)).toHaveLength(1);
  });

  it("removes only this event seat and keeps the person", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
    ]);

    await expect(removeGuest(1, 1, "event")).resolves.toBe("ok");
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([2]);
    expect(mockDb.rows(schema.person)).toHaveLength(1);
  });

  it("deletes the person and every event seat", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
      makeGuest({ id: 3, eventId: 1, personId: 2 }),
    ]);

    await expect(removeGuest(1, 1, "person")).resolves.toBe("ok");
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([3]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2]);
  });

  it("refuses to delete a seat that is in a completed draw", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ giverId: 1, receiverId: 2 }),
    ]);

    await expect(removeGuest(1, 1, "event")).rejects.toThrow(PersonError);
    await expect(removeGuest(1, 1, "event")).rejects.toThrow(
      "This guest is part of a completed draw and cannot be removed.",
    );
    expect(mockDb.rows(schema.guest)).toHaveLength(2);
  });
});

describe("listPeopleWithEvents", () => {
  it("includes unseated people and seats sorted by recency", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, name: "Older", occursOn: "2025-12-24" }),
      makeEvent({ id: 2, name: "Newer", occursOn: "2026-12-24" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Cyd" }),
      makePerson({ id: 2, name: "Ada" }),
      makePerson({ id: 3, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 2 }),
      makeGuest({ id: 2, eventId: 2, personId: 2 }),
      makeGuest({ id: 3, eventId: 1, personId: 3 }),
    ]);

    const people = await listPeopleWithEvents();
    expect(people.map((p) => p.name)).toEqual(["Ada", "Bea", "Cyd"]);
    expect(people[0].events.map((e) => e.name)).toEqual(["Newer", "Older"]);
    expect(people[1].events).toHaveLength(1);
    expect(people[2].events).toEqual([]);
  });

  it("breaks name ties by person id", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 2, name: "Ada" }),
      makePerson({ id: 1, name: "Ada" }),
    ]);
    const people = await listPeopleWithEvents();
    expect(people.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("updatePerson", () => {
  it("updates contact on the person without clearing a linked login email", async () => {
    mockDb.seed(schema.user, [
      makeUser({ id: "user_1", name: "Old", email: "login@example.com" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Old",
        email: "ada@example.com",
        userId: "user_1",
        gender: "female",
        ...polishNameCases("Old"),
      }),
    ]);

    const updated = await updatePerson(1, {
      name: "Ada",
      email: null,
      phone: "351912345678",
    });
    expect(updated).toMatchObject({
      name: "Ada",
      email: null,
      phone: "351912345678",
    });
    expect(mockDb.rows(schema.user)[0]).toMatchObject({
      name: "Old",
      email: "login@example.com",
    });
  });

  it("updates gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, gender: null, ...polishNameCases("Person 1") }),
    ]);
    const updated = await updatePerson(1, { gender: "female" });
    expect(updated).toMatchObject({ gender: "female" });
  });

  it("refuses a save that leaves a Polish case blank", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        gender: "female",
        ...polishNameCases("Ada"),
      }),
    ]);
    await expect(updatePerson(1, { nameWolacz: " " })).rejects.toThrow(
      "Enter the missing Polish cases: Wołacz.",
    );
    expect(mockDb.rows(schema.person)[0]?.nameWolacz).toBe("Ada");
  });
});

describe("removePerson", () => {
  it("returns false when the person is missing", async () => {
    await expect(removePerson(9)).resolves.toBe(false);
  });

  it("deletes the person and every event seat", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
      makeGuest({ id: 3, eventId: 1, personId: 2 }),
    ]);

    await expect(removePerson(1)).resolves.toBe(true);
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([3]);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2]);
  });

  it("refuses to delete a person seated in a completed draw", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ giverId: 1, receiverId: 2 }),
    ]);

    await expect(removePerson(1)).rejects.toThrow(PersonError);
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("guestEmailById", () => {
  it("prefers the person email and falls back to the linked login", async () => {
    mockDb.seed(schema.user, [
      makeUser({ id: "user_bea", email: "login@example.com" }),
    ]);
    const map = await guestEmailById([
      { id: 1, email: "ada@example.com", userId: null },
      { id: 2, email: null, userId: "user_bea" },
      { id: 3, email: null, userId: null },
      { id: 4, email: null, userId: "missing" },
    ]);
    expect(map.get(1)).toBe("ada@example.com");
    expect(map.get(2)).toBe("login@example.com");
    expect(map.has(3)).toBe(false);
    expect(map.has(4)).toBe(false);
  });

  it("ignores a login id that is cleared while users load", async () => {
    mockDb.seed(schema.user, [
      makeUser({ id: "user_bea", email: "login@example.com" }),
    ]);
    const guest: { id: number; email: string | null; userId: string | null } = {
      id: 2,
      email: null,
      userId: "user_bea",
    };
    const orig = db.select.bind(db);
    const select = vi.spyOn(db, "select").mockImplementation((fields) => {
      guest.userId = null;
      return orig(fields);
    });
    const map = await guestEmailById([guest]);
    select.mockRestore();
    expect(map.has(2)).toBe(false);
  });
});

describe("addGuestToEvent", () => {
  it("returns duplicate when the person is already seated", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
    await expect(addGuestToEvent(1, 1)).resolves.toBe("duplicate");
  });

  it("refuses a person without a gender", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, gender: null })]);
    await expect(addGuestToEvent(1, 1)).rejects.toThrow(
      GENDER_REQUIRED_MESSAGE,
    );
    expect(mockDb.rows(schema.guest)).toHaveLength(0);
  });

  it("seats a person who has a gender", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, gender: "female" })]);
    await expect(addGuestToEvent(1, 1)).resolves.toMatchObject({
      eventId: 1,
      personId: 1,
    });
    expect(mockDb.rows(schema.guest)).toHaveLength(1);
  });

  it("returns duplicate when the insert reports no row", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, gender: "female" })]);
    vi.spyOn(libDb, "first").mockResolvedValueOnce(undefined);
    await expect(addGuestToEvent(1, 1)).resolves.toBe("duplicate");
  });
});

describe("assertLinkableUser", () => {
  it("rejects a missing user and a user already linked to someone else", async () => {
    mockDb.seed(schema.user, [makeUser({ id: "user_1" })]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, userId: "user_1" }),
      makePerson({ id: 2 }),
    ]);
    await expect(assertLinkableUser("missing", 2)).rejects.toThrow(
      "That user account does not exist.",
    );
    await expect(assertLinkableUser("user_1", 2)).rejects.toThrow(
      "That account is already linked.",
    );
    await expect(assertLinkableUser("user_1", 1)).resolves.toBeUndefined();
  });
});

describe("setPersonPhoto", () => {
  it("returns undefined for a missing person", async () => {
    await expect(setPersonPhoto(9, `${"ab".repeat(24)}.jpg`)).resolves.toBeUndefined();
  });

  it("stores a new filename", async () => {
    const oldName = `${"ab".repeat(24)}.jpg`;
    const newName = `${"cd".repeat(24)}.png`;
    mockDb.seed(schema.person, [makePerson({ id: 1, photo: oldName })]);
    const updated = await setPersonPhoto(1, newName);
    expect(updated?.photo).toBe(newName);
  });

  it("leaves the same filename in place", async () => {
    const name = `${"ab".repeat(24)}.jpg`;
    mockDb.seed(schema.person, [makePerson({ id: 1, photo: name })]);
    const updated = await setPersonPhoto(1, name);
    expect(updated?.photo).toBe(name);
  });
});

describe("guestsBelongToEvent", () => {
  it("treats an empty id list as belonging", async () => {
    await expect(guestsBelongToEvent(1, [])).resolves.toBe(true);
  });
});

describe("updatePerson leftovers", () => {
  it("returns undefined for a missing person", async () => {
    await expect(updatePerson(9, { name: "Ada" })).resolves.toBeUndefined();
  });

  it("returns the existing row when the patch is empty", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", gender: "male" }),
    ]);
    const updated = await updatePerson(1, {});
    expect(updated).toMatchObject({ name: "Ada", gender: "male" });
  });

  it("refuses an empty patch when the person has no gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", gender: null }),
    ]);
    await expect(updatePerson(1, {})).rejects.toThrow(GENDER_REQUIRED_MESSAGE);
    expect(mockDb.rows(schema.person)[0]?.gender).toBeNull();
  });

  it("keeps a stored gender when the patch omits it", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        gender: "female",
        phone: null,
        ...polishNameCases("Ada"),
      }),
    ]);
    const updated = await updatePerson(1, { phone: "351900000000" });
    expect(updated).toMatchObject({
      phone: "351900000000",
      gender: "female",
    });
  });

  it("refuses to clear gender or save a person who still has none", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        gender: "male",
        ...polishNameCases("Ada"),
      }),
    ]);
    await expect(updatePerson(1, { gender: null })).rejects.toThrow(
      GENDER_REQUIRED_MESSAGE,
    );
    expect(mockDb.rows(schema.person)[0]?.gender).toBe("male");

    mockDb.seed(schema.person, [
      makePerson({
        id: 2,
        name: "Bea",
        gender: null,
        ...polishNameCases("Bea"),
      }),
    ]);
    await expect(updatePerson(2, { name: "Beata" })).rejects.toThrow(
      GENDER_REQUIRED_MESSAGE,
    );
    expect(mockDb.rows(schema.person).find((row) => row.id === 2)).toMatchObject({
      name: "Bea",
      gender: null,
    });
  });
});

describe("findOrCreatePerson extras", () => {
  it("skips lookup when the name is blank", async () => {
    const { person } = await findOrCreatePerson({
      name: "   ",
      phone: null,
      email: null,
      gender: "female",
      ...polishNameCases("Ada"),
    });
    expect(person.name).toBe("   ");
  });

  it("returns the existing person when an update returns no row", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", phone: null }),
    ]);
    vi.spyOn(await import("@/lib/db"), "first").mockResolvedValueOnce(
      undefined,
    );
    const { person, created } = await findOrCreatePerson(
      personInput("Ada", { phone: "351912345678" }),
    );
    expect(created).toBe(false);
    expect(person).toMatchObject({ id: 1, phone: null });
  });

  it("rejects an invalid gender and leaves the stored gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        phone: "351912345678",
        gender: "female",
        ...polishNameCases("Ada"),
      }),
    ]);
    await expect(
      findOrCreatePerson({
        name: "Ada",
        phone: "351912345678",
        email: null,
        gender: "nope",
        ...polishNameCases("Ada"),
      }),
    ).rejects.toThrow(GENDER_REQUIRED_MESSAGE);
    expect(mockDb.rows(schema.person)[0]?.gender).toBe("female");
  });

  it("refuses to create a person without a gender", async () => {
    await expect(
      findOrCreatePerson(personInput("Ada", { gender: null })),
    ).rejects.toThrow(GENDER_REQUIRED_MESSAGE);
    expect(mockDb.rows(schema.person)).toHaveLength(0);
  });

  it("refuses to reuse a genderless person when the save omits gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        phone: "351912345678",
        gender: null,
        ...polishNameCases("Ada"),
      }),
    ]);
    await expect(
      findOrCreatePerson(
        personInput("Ada", { phone: "351912345678", gender: undefined }),
      ),
    ).rejects.toThrow(GENDER_REQUIRED_MESSAGE);
    expect(mockDb.rows(schema.person)[0]?.gender).toBeNull();
  });

  it("does not reuse a namesake with a different email", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", email: "ada@example.com" }),
    ]);
    const { person, created } = await findOrCreatePerson(
      personInput("Ada", { email: "other@example.com" }),
    );
    expect(created).toBe(true);
    expect(person.id).not.toBe(1);
  });
});

describe("removePerson without seats", () => {
  it("deletes a person who was never a guest", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    await expect(removePerson(1)).resolves.toBe(true);
    expect(mockDb.rows(schema.person)).toEqual([]);
  });
});

describe("guestsForEvent", () => {
  it("returns seats sorted by name", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Cyd" }),
      makePerson({ id: 2, name: "ada" }),
      makePerson({ id: 3, name: "Bea" }),
      makePerson({ id: 4, name: "Other" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 30, eventId: 1, personId: 1 }),
      makeGuest({ id: 10, eventId: 1, personId: 2 }),
      makeGuest({ id: 20, eventId: 1, personId: 3 }),
      makeGuest({ id: 40, eventId: 2, personId: 4 }),
    ]);

    const guests = await guestsForEvent(1);
    expect(guests.map((g) => g.name)).toEqual(["ada", "Bea", "Cyd"]);
    expect(guests.map((g) => g.id)).toEqual([10, 20, 30]);
  });

  it("breaks equal names by seat id", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Ada" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 20, personId: 2 }),
      makeGuest({ id: 10, personId: 1 }),
    ]);
    const guests = await guestsForEvent(1);
    expect(guests.map((g) => g.id)).toEqual([10, 20]);
  });
});
