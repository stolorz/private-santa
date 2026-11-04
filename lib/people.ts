import "server-only";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db, first, schema, type DbHandle } from "@/lib/db";
import { PersonError } from "@/lib/errors";
import type { Guest, GuestView, Person } from "@/lib/db/schema";
import { compareEventsByRecency } from "@/lib/event-code";
import { compareNames, normalizeName } from "@/lib/person-name";
import { requireGender, type Gender } from "@/lib/gender";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "@/lib/language";
import {
  asNameCases,
  fillEmptyNameCases,
  missingPolishCasesMessage,
  optionalNameCasesFromBody,
  optionalNameCasesPatch,
  resolvedNameCases,
  type NameCases,
  type OptionalNameCaseField,
} from "@/lib/name-cases";
import { deletePhoto } from "@/lib/photo";
import type {
  GuestDeleteScope,
  PersonEventSeat,
  PersonWithEvents,
} from "@/lib/people-types";
import { requestCache } from "@/lib/request-cache";
import { mustExist } from "@/lib/utils";

export type {
  GuestDeleteScope,
  PersonEventSeat,
  PersonWithEvents,
} from "@/lib/people-types";

export { normalizeGuestEmail as normalizeEmail } from "@/lib/guest-contact";

export { PersonError } from "@/lib/errors";
export { personFieldsSchema } from "@/lib/schemas";

export function asGuestView(seat: Guest, p: Person): GuestView {
  const names = asNameCases(p);
  return {
    ...p,
    ...seat,
    ...names,
    gender: names.gender ?? null,
  };
}

function guestViewSelect(handle: DbHandle = db) {
  return handle
    .select({ guest: schema.guest, person: schema.person })
    .from(schema.guest)
    .innerJoin(schema.person, eq(schema.guest.personId, schema.person.id));
}

export async function getPersonById(id: number): Promise<Person | undefined> {
  return db.select().from(schema.person).where(eq(schema.person.id, id)).get();
}

export async function listPeople(): Promise<Person[]> {
  return db.select().from(schema.person);
}

export async function listPeopleWithEvents(): Promise<PersonWithEvents[]> {
  const people = await listPeople();
  const seats = await db
    .select({
      personId: schema.guest.personId,
      event: schema.event,
    })
    .from(schema.guest)
    .innerJoin(schema.event, eq(schema.guest.eventId, schema.event.id));

  const byPerson = new Map<
    number,
    (PersonEventSeat & { createdAt: Date })[]
  >();
  for (const row of seats) {
    const list = byPerson.get(row.personId) ?? [];
    list.push({
      id: row.event.id,
      code: row.event.code,
      name: row.event.name,
      occursOn: row.event.occursOn,
      createdAt: row.event.createdAt,
    });
    byPerson.set(row.personId, list);
  }

  return people
    .map((person) => ({
      ...person,
      events: [...(byPerson.get(person.id) ?? [])]
        .sort(compareEventsByRecency)
        .map(({ id, code, name, occursOn }) => ({ id, code, name, occursOn })),
    }))
    .sort((a, b) => compareNames(a.name, b.name) || a.id - b.id);
}


async function peopleWithName(name: string): Promise<Person[]> {
  const n = normalizeName(name);
  if (!n) return [];
  return db
    .select()
    .from(schema.person)
    .where(eq(schema.person.nameNormalized, n))
    .all();
}

function contactCompatible(
  person: Person,
  phone: string | null,
  email: string | null,
): boolean {
  if (phone && person.phone && person.phone !== phone) return false;
  if (email && person.email && person.email !== email) return false;
  return true;
}

/**
 * Organiser row created at signup. Gender and Polish cases stay empty
 * until a later person save.
 */
export function insertOrganiserPerson(
  userId: string,
  extra: { name: string; phone: string | null; email: string | null },
): void {
  db.insert(schema.person)
    .values({
      name: extra.name,
      nameNormalized: normalizeName(extra.name),
      phone: extra.phone,
      email: extra.email,
      userId,
    })
    .run();
}

export async function findOrCreatePerson(opts: {
  name: string;
  phone: string | null;
  email: string | null;
  language?: string | null;
  gender?: string | null;
  /** Insert a new row even when a contactless namesake already exists. */
  createNew?: boolean;
} & Partial<Omit<NameCases, "name" | "gender">>): Promise<{ person: Person; created: boolean }> {
  const phone = opts.phone || null;
  const email = opts.email || null;
  const namesakes = opts.createNew
    ? []
    : (await peopleWithName(opts.name)).filter((p) =>
        contactCompatible(p, phone, email),
      );
  if (namesakes.length > 1) {
    throw new PersonError(
      "Several people share that name. Add a phone or email to pick the right one.",
    );
  }
  const existing = namesakes[0];
  if (!phone && !email && existing) {
    throw new PersonError(
      `A person named ${existing.name} already exists. Choose them from the list, or add a phone or email.`,
    );
  }
  const language =
    opts.language && isLanguage(opts.language) ? opts.language : undefined;
  const gender = requireGender(
    opts.gender !== undefined ? opts.gender : existing?.gender,
  );

  const cases = optionalNameCasesFromBody(opts);
  const caseMessage = missingPolishCasesMessage(
    resolvedNameCases(existing, cases),
  );
  if (caseMessage) throw new PersonError(caseMessage);

  if (existing) {
    const fill: {
      phone?: string | null;
      email?: string | null;
      language?: Language;
      gender?: Gender;
    } & Partial<NameCases> = {
      ...fillEmptyNameCases(existing, cases),
    };
    if (language && language !== existing.language) fill.language = language;
    if (gender !== existing.gender) fill.gender = gender;
    if (!existing.phone && phone) fill.phone = phone;
    if (!existing.email && email) fill.email = email;
    if (Object.keys(fill).length === 0) {
      return { person: existing, created: false };
    }
    const updated = await first(
      db
        .update(schema.person)
        .set(fill)
        .where(eq(schema.person.id, existing.id))
        .returning(),
    );
    return { person: updated ?? existing, created: false };
  }
  const created = await first(
    db
      .insert(schema.person)
      .values({
        name: opts.name,
        nameNormalized: normalizeName(opts.name),
        phone,
        email,
        language: language ?? DEFAULT_LANGUAGE,
        gender,
        ...cases,
      })
      .returning(),
  );
  return { person: mustExist(created, "Could not create person."), created: true };
}

export async function guestEmailById(
  guests: Array<{ id: number; email: string | null; userId: string | null }>,
): Promise<Map<number, string>> {
  const emailByGuest = new Map<number, string>();
  const needingUser: typeof guests = [];
  for (const g of guests) {
    if (g.email) {
      emailByGuest.set(g.id, g.email);
      continue;
    }
    if (g.userId) needingUser.push(g);
  }
  const userIds = [
    ...new Set(
      needingUser
        .map((g) => g.userId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (userIds.length === 0) return emailByGuest;
  const users = await db
    .select()
    .from(schema.user)
    .where(inArray(schema.user.id, userIds));
  const emailByUser = new Map(users.map((u) => [u.id, u.email]));
  for (const g of needingUser) {
    const email = g.userId ? emailByUser.get(g.userId) : undefined;
    if (email) emailByGuest.set(g.id, email);
  }
  return emailByGuest;
}

export const guestsForEvent = requestCache(
  async function guestsForEvent(eventId: number): Promise<GuestView[]> {
    const rows = guestViewSelect()
      .where(eq(schema.guest.eventId, eventId))
      .all();
    return rows
      .map((r) => asGuestView(r.guest, r.person))
      .sort((a, b) => compareNames(a.name, b.name) || a.id - b.id);
  },
);

export async function guestById(id: number): Promise<GuestView | undefined> {
  const row = guestViewSelect().where(eq(schema.guest.id, id)).get();
  return row ? asGuestView(row.guest, row.person) : undefined;
}

export async function guestInEdition(
  eventId: number,
  guestId: number,
): Promise<GuestView | undefined> {
  const row = guestViewSelect()
    .where(and(eq(schema.guest.eventId, eventId), eq(schema.guest.id, guestId)))
    .get();
  return row ? asGuestView(row.guest, row.person) : undefined;
}

export async function guestsBelongToEvent(
  eventId: number,
  ids: number[],
): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return true;
  const members = await db
    .select({ id: schema.guest.id })
    .from(schema.guest)
    .where(
      and(eq(schema.guest.eventId, eventId), inArray(schema.guest.id, unique)),
    );
  return members.length === unique.length;
}

export async function assertLinkableUser(
  userId: string,
  personId: number,
): Promise<void> {
  const userExists = db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .get();
  if (!userExists) throw new PersonError("That user account does not exist.");
  const taken = db
    .select({ id: schema.person.id })
    .from(schema.person)
    .where(
      and(eq(schema.person.userId, userId), ne(schema.person.id, personId)),
    )
    .get();
  if (taken) throw new PersonError("That account is already linked.");
}

export async function addGuestToEvent(
  eventId: number,
  personId: number,
): Promise<Guest | "duplicate"> {
  const existing = db
    .select()
    .from(schema.guest)
    .where(
      and(
        eq(schema.guest.eventId, eventId),
        eq(schema.guest.personId, personId),
      ),
    )
    .get();
  if (existing) return "duplicate";

  const person = await getPersonById(personId);
  requireGender(person?.gender);

  const created = await first(
    db
      .insert(schema.guest)
      .values({ eventId, personId })
      .onConflictDoNothing()
      .returning(),
  );
  return created ?? "duplicate";
}

/** How many other editions each guest of this edition is seated in. */
export async function otherEventSeatCounts(
  eventId: number,
  seatedPersonIds?: number[],
): Promise<Record<number, number>> {
  const personIds = seatedPersonIds
    ? [...new Set(seatedPersonIds)]
    : [
        ...new Set(
          (
            await db
              .select({ personId: schema.guest.personId })
              .from(schema.guest)
              .where(eq(schema.guest.eventId, eventId))
          ).map((g) => g.personId),
        ),
      ];
  const counts: Record<number, number> = {};
  for (const id of personIds) counts[id] = 0;
  if (personIds.length === 0) return counts;

  const seats = await db
    .select({
      personId: schema.guest.personId,
      eventId: schema.guest.eventId,
    })
    .from(schema.guest)
    .where(inArray(schema.guest.personId, personIds));

  for (const seat of seats) {
    if (seat.eventId === eventId) continue;
    counts[seat.personId] = (counts[seat.personId] ?? 0) + 1;
  }
  return counts;
}

export type PeopleExclusiveToEvent = {
  exclusive: number[];
  notSeated: number[];
  shared: number[];
};

/**
 * Split `personIds` by whether each person is seated only in `eventId`.
 * Duplicate ids are collapsed, preserving first-seen order.
 */
export function peopleExclusiveToEvent(
  eventId: number,
  personIds: number[],
  handle: DbHandle = db,
): PeopleExclusiveToEvent {
  const unique: number[] = [];
  const seen = new Set<number>();
  for (const id of personIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  const exclusive: number[] = [];
  const notSeated: number[] = [];
  const shared: number[] = [];
  if (unique.length === 0) {
    return { exclusive, notSeated, shared };
  }

  const seats = handle
    .select({
      personId: schema.guest.personId,
      eventId: schema.guest.eventId,
    })
    .from(schema.guest)
    .where(inArray(schema.guest.personId, unique))
    .all();

  const eventsByPerson = new Map<number, Set<number>>();
  for (const seat of seats) {
    let events = eventsByPerson.get(seat.personId);
    if (!events) {
      events = new Set();
      eventsByPerson.set(seat.personId, events);
    }
    events.add(seat.eventId);
  }

  for (const id of unique) {
    const events = eventsByPerson.get(id);
    if (!events || !events.has(eventId)) {
      notSeated.push(id);
      continue;
    }
    if (events.size > 1) shared.push(id);
    else exclusive.push(id);
  }

  return { exclusive, notSeated, shared };
}

export type PersonPatch = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  language?: Language;
  gender?: string | null;
  userId?: string | null;
} & Partial<Record<OptionalNameCaseField, string | null>>;

function pickDefined<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export async function updatePerson(
  personId: number,
  patch: PersonPatch,
): Promise<Person | undefined> {
  const existing = await getPersonById(personId);
  if (!existing) return undefined;

  const gender = requireGender(
    patch.gender !== undefined ? patch.gender : existing.gender,
  );
  const personSet = pickDefined({
    name: patch.name,
    nameNormalized:
      patch.name !== undefined ? normalizeName(patch.name) : undefined,
    phone: patch.phone,
    email: patch.email,
    language: patch.language,
    gender: patch.gender === undefined ? undefined : gender,
    userId: patch.userId,
    ...optionalNameCasesPatch(patch),
  });

  if (Object.keys(personSet).length === 0) return existing;
  const caseMessage = missingPolishCasesMessage({ ...existing, ...personSet });
  if (caseMessage) throw new PersonError(caseMessage);
  const [updated] = db
    .update(schema.person)
    .set(personSet)
    .where(eq(schema.person.id, personId))
    .returning()
    .all();
  return updated;
}

export async function setPersonPhoto(
  personId: number,
  filename: string | null,
): Promise<Person | undefined> {
  const existing = await getPersonById(personId);
  if (!existing) return undefined;
  if (existing.photo !== filename) await deletePhoto(existing.photo);
  await db
    .update(schema.person)
    .set({ photo: filename })
    .where(eq(schema.person.id, personId));
  return getPersonById(personId);
}

function guestIdsForPerson(personId: number, handle: DbHandle = db): number[] {
  return handle
    .select({ id: schema.guest.id })
    .from(schema.guest)
    .where(eq(schema.guest.personId, personId))
    .all()
    .map((row) => row.id);
}

function isInCompletedDraw(guestIds: number[], handle: DbHandle = db): boolean {
  if (guestIds.length === 0) return false;
  return (
    handle
      .select({ id: schema.assignment.id })
      .from(schema.assignment)
      .innerJoin(schema.draw, eq(schema.assignment.drawId, schema.draw.id))
      .where(
        and(
          eq(schema.draw.status, "completed"),
          or(
            inArray(schema.assignment.giverId, guestIds),
            inArray(schema.assignment.receiverId, guestIds),
          ),
        ),
      )
      .get() != null
  );
}

export async function removePerson(personId: number): Promise<boolean> {
  const existing = await getPersonById(personId);
  if (!existing) return false;
  db.transaction((tx) => {
    const guestIds = guestIdsForPerson(personId, tx);
    if (isInCompletedDraw(guestIds, tx)) {
      throw new PersonError(
        "This person is part of a completed draw and cannot be removed.",
      );
    }
    tx.delete(schema.guest).where(eq(schema.guest.personId, personId)).run();
    tx.delete(schema.person).where(eq(schema.person.id, personId)).run();
  });
  await deletePhoto(existing.photo);
  return true;
}

/**
 * Remove a guest seat from one edition, or wipe the person (every seat,
 * contact, and photo) from the database.
 */
export async function removeGuest(
  guestId: number,
  eventId: number,
  scope: GuestDeleteScope,
): Promise<"ok" | "not_found"> {
  const existing = await guestById(guestId);
  if (!existing || existing.eventId !== eventId) return "not_found";

  if (scope === "person") {
    await removePerson(existing.personId);
    return "ok";
  }

  db.transaction((tx) => {
    if (isInCompletedDraw([existing.id], tx)) {
      throw new PersonError(
        "This guest is part of a completed draw and cannot be removed.",
      );
    }
    tx.delete(schema.guest)
      .where(
        and(eq(schema.guest.id, existing.id), eq(schema.guest.eventId, eventId)),
      )
      .run();
  });
  return "ok";
}
