import "server-only";
import { and, count, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { db, schema, type DbHandle } from "@/lib/db";
import type { Event, EventSeries } from "@/lib/db/schema";
import {
  eventNameOverlays,
  missingEventNameCasesMessage,
  missingEventTranslationsMessage,
} from "@/lib/event-name";
import { compareEventsByRecency, eventCode, isValidOccursOn, slugify } from "@/lib/event-code";
import { missingEventDateMessage } from "@/lib/event-date";
import {
  eventLocationFrom,
  missingEventLocationMessage,
  normalizeLocation,
} from "@/lib/event-location";
import {
  normalizeNameCase,
  optionalNameCasesPatch,
  type OptionalNameCaseField,
} from "@/lib/name-cases";
import {
  budgetChoiceError,
  effectiveBudgetKind,
  isBudgetKind,
  type BudgetKind,
  type Currency,
} from "@/lib/budget";
import { EventError } from "@/lib/errors";
import { guestsForEvent, peopleExclusiveToEvent } from "@/lib/people";
import { deletePhoto } from "@/lib/photo";
import { requestCache } from "@/lib/request-cache";
import type { EventPatch } from "@/lib/schemas";
import { editionProblemCount } from "@/lib/event-problems";
import {
  copyEventTemplatesOn,
  loadEventTemplatesOn,
} from "@/lib/templates/event-rows";
import { mustExist } from "@/lib/utils";

export { EventError };
export type { EventPatch } from "@/lib/schemas";

async function getSeriesById(
  id: number,
): Promise<EventSeries | undefined> {
  return db
    .select()
    .from(schema.eventSeries)
    .where(eq(schema.eventSeries.id, id))
    .get();
}

async function getSeriesBySlug(
  slug: string,
): Promise<EventSeries | undefined> {
  return db
    .select()
    .from(schema.eventSeries)
    .where(eq(schema.eventSeries.slug, slug))
    .get();
}

export const getEventById = requestCache(
  async function getEventById(id: number): Promise<Event | undefined> {
    return db.select().from(schema.event).where(eq(schema.event.id, id)).get();
  },
);

export async function getEventByCode(code: string): Promise<Event | undefined> {
  return db.select().from(schema.event).where(eq(schema.event.code, code)).get();
}

export const getEventWithSeriesByCode = requestCache(
  async function getEventWithSeriesByCode(
    code: string,
  ): Promise<{ event: Event; series: EventSeries } | undefined> {
    return db
      .select({ event: schema.event, series: schema.eventSeries })
      .from(schema.event)
      .innerJoin(
        schema.eventSeries,
        eq(schema.event.seriesId, schema.eventSeries.id),
      )
      .where(eq(schema.event.code, code))
      .get();
  },
);

export async function uniqueSeriesSlug(fromName: string): Promise<string> {
  const base = slugify(fromName);
  let slug = base;
  let n = 2;
  while (await getSeriesBySlug(slug)) {
    const suffix = `-${n}`;
    slug = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    n += 1;
  }
  return slug;
}

export async function uniqueEventCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = eventCode();
    if (!(await getEventByCode(code))) return code;
  }
  throw new Error("Could not allocate an event id.");
}

function seriesHasEarlierOccursOn(
  seriesId: number,
  occursOn: string,
  excludeId?: number,
): boolean {
  return (
    db
      .select({ id: schema.event.id })
      .from(schema.event)
      .where(
        and(
          eq(schema.event.seriesId, seriesId),
          lt(schema.event.occursOn, occursOn),
          excludeId != null ? ne(schema.event.id, excludeId) : undefined,
        ),
      )
      .get() != null
  );
}

/** True when another edition in the series occurs on an earlier date. */
export async function hasEarlierEdition(
  seriesId: number,
  event: Pick<Event, "id" | "occursOn">,
): Promise<boolean> {
  return seriesHasEarlierOccursOn(seriesId, event.occursOn, event.id);
}

async function latestOtherEdition(seriesId: number): Promise<Event | undefined> {
  return db
    .select()
    .from(schema.event)
    .where(eq(schema.event.seriesId, seriesId))
    .orderBy(
      desc(schema.event.occursOn),
      desc(schema.event.createdAt),
      desc(schema.event.id),
    )
    .get();
}

export async function createSeriesWithFirstEdition(opts: {
  name: string;
  occursOn: string;
}): Promise<{ series: EventSeries; event: Event }> {
  const name = opts.name.trim();
  const slug = await uniqueSeriesSlug(name);
  const code = await uniqueEventCode();
  return db.transaction((tx) => {
    const series = mustExist(
      tx.insert(schema.eventSeries).values({ name, slug }).returning().all()[0],
      "Could not create series.",
    );
    const created = mustExist(
      tx
        .insert(schema.event)
        .values({
          seriesId: series.id,
          code,
          name,
          occursOn: opts.occursOn,
          budget: null,
          currency: "EUR",
          allowSelfDraw: false,
          avoidPastPairings: false,
        })
        .returning()
        .all()[0],
      "Could not create event.",
    );
    copyEventTemplatesOn(tx, created.id);
    return { series, event: created };
  });
}

export async function createEdition(opts: {
  seriesId: number;
  occursOn: string;
  name: string;
  fromEventId?: number;
}): Promise<Event> {
  const series = await getSeriesById(opts.seriesId);
  if (!series) throw new EventError("Unknown series.");
  let source: Event | undefined;
  if (opts.fromEventId != null) {
    source = await getEventById(opts.fromEventId);
    if (!source || source.seriesId !== series.id) {
      throw new EventError("Unknown source edition.");
    }
  }
  const name = opts.name.trim();
  const code = await uniqueEventCode();
  if (!source) source = await latestOtherEdition(series.id);
  return db.transaction((tx) => {
    const created = mustExist(
      tx
        .insert(schema.event)
        .values({
          seriesId: series.id,
          code,
          name,
          occursOn: opts.occursOn,
          budgetKind: effectiveBudgetKind(source),
          budget: source?.budget ?? null,
          currency: source?.currency ?? "EUR",
          budgetEur: source?.budgetEur ?? null,
          budgetPln: source?.budgetPln ?? null,
          budgetJpy: source?.budgetJpy ?? null,
          ...eventNameOverlays(source),
          ...eventLocationFrom(source),
          allowSelfDraw: false,
          avoidPastPairings: seriesHasEarlierOccursOn(
            series.id,
            opts.occursOn,
          ),
        })
        .returning()
        .all()[0],
      "Could not create edition.",
    );
    if (source) copyGuestsAndExclusionsOn(tx, source.id, created.id);
    copyEventTemplatesOn(tx, created.id, source?.id);
    return created;
  });
}

function copyGuestsAndExclusionsOn(
  tx: DbHandle,
  fromEventId: number,
  toEventId: number,
): void {
  const sourceGuests = tx
    .select()
    .from(schema.guest)
    .where(eq(schema.guest.eventId, fromEventId))
    .all();
  const personToNewGuest = new Map<number, number>();
  if (sourceGuests.length > 0) {
    const created = tx
      .insert(schema.guest)
      .values(
        sourceGuests.map((seat) => ({
          eventId: toEventId,
          personId: seat.personId,
        })),
      )
      .returning()
      .all();
    for (const row of created) {
      personToNewGuest.set(row.personId, row.id);
    }
  }

  const exclusions = tx
    .select()
    .from(schema.exclusion)
    .where(eq(schema.exclusion.eventId, fromEventId))
    .all();
  const sourceById = new Map(sourceGuests.map((g) => [g.id, g]));
  const copied: Array<{ eventId: number; aId: number; bId: number }> = [];
  for (const ex of exclusions) {
    const aPerson = sourceById.get(ex.aId)?.personId;
    const bPerson = sourceById.get(ex.bId)?.personId;
    const aId = aPerson != null ? personToNewGuest.get(aPerson) : undefined;
    const bId = bPerson != null ? personToNewGuest.get(bPerson) : undefined;
    if (aId == null || bId == null) continue;
    copied.push({ eventId: toEventId, aId, bId });
  }
  if (copied.length > 0) {
    tx.insert(schema.exclusion).values(copied).run();
  }
}

export type EventWithSeries = { event: Event; series: EventSeries };

type GroupedSeries = {
  series: EventSeries;
  editions: Event[];
};

export type SeriesWithEditions = {
  series: EventSeries;
  editions: Array<Event & { problemCount: number }>;
};

function groupBySeries(rows: EventWithSeries[]): GroupedSeries[] {
  const byId = new Map<number, GroupedSeries>();
  const order: number[] = [];
  for (const row of rows) {
    let bucket = byId.get(row.series.id);
    if (!bucket) {
      bucket = { series: row.series, editions: [] };
      byId.set(row.series.id, bucket);
      order.push(row.series.id);
    }
    bucket.editions.push(row.event);
  }
  for (const bucket of byId.values()) {
    bucket.editions.sort(compareEventsByRecency);
  }
  return order.map((id) => byId.get(id)!);
}

async function listEventsWithSeries(): Promise<EventWithSeries[]> {
  return db
    .select({ event: schema.event, series: schema.eventSeries })
    .from(schema.event)
    .innerJoin(
      schema.eventSeries,
      eq(schema.event.seriesId, schema.eventSeries.id),
    );
}

export async function visibleEventsFor(user: {
  id: string;
  role?: string | null;
}): Promise<EventWithSeries[]> {
  if (user.role !== "admin") return [];
  return listEventsWithSeries();
}

export async function visibleSeriesFor(user: {
  id: string;
  role?: string | null;
}): Promise<SeriesWithEditions[]> {
  const groups = groupBySeries(await visibleEventsFor(user));
  return Promise.all(
    groups.map(async (group) => ({
      series: group.series,
      editions: await Promise.all(
        group.editions.map(async (event) => ({
          ...event,
          problemCount: editionProblemCount(
            event,
            loadEventTemplatesOn(db, event.id),
            await guestsForEvent(event.id),
          ),
        })),
      ),
    })),
  );
}

export type EventImpact = {
  guests: number;
  wishlists: number;
  exclusions: number;
  draftDraws: number;
  completedDraws: number;
  otherEditions: number;
};

export type EventDeleteGuest = {
  personId: number;
  name: string;
  exclusive: boolean;
};

async function counted(
  query: PromiseLike<{ c: number }[]>,
): Promise<number> {
  return Number((await query)[0]?.c ?? 0);
}

export async function eventImpact(
  event: Event,
  series: Pick<EventSeries, "id" | "name">,
): Promise<{
  event: Event;
  series: { id: number; name: string };
  impact: EventImpact;
  guests: EventDeleteGuest[];
}> {
  const guestViews = await guestsForEvent(event.id);
  const guestIds = guestViews.map((g) => g.id);
  const exclusive = new Set(
    peopleExclusiveToEvent(
      event.id,
      guestViews.map((g) => g.personId),
    ).exclusive,
  );

  const [wishlists, exclusions, draws, otherEditions] = await Promise.all([
    guestIds.length === 0
      ? Promise.resolve(0)
      : counted(
          db
            .select({ c: count() })
            .from(schema.wishlistItem)
            .where(inArray(schema.wishlistItem.guestId, guestIds)),
        ),
    counted(
      db
        .select({ c: count() })
        .from(schema.exclusion)
        .where(eq(schema.exclusion.eventId, event.id)),
    ),
    db
      .select({ status: schema.draw.status })
      .from(schema.draw)
      .where(eq(schema.draw.eventId, event.id)),
    counted(
      db
        .select({ c: count() })
        .from(schema.event)
        .where(
          and(
            eq(schema.event.seriesId, event.seriesId),
            ne(schema.event.id, event.id),
          ),
        ),
    ),
  ]);

  return {
    event,
    series: { id: series.id, name: series.name },
    impact: {
      guests: guestViews.length,
      wishlists,
      exclusions,
      draftDraws: draws.filter((d) => d.status !== "completed").length,
      completedDraws: draws.filter((d) => d.status === "completed").length,
      otherEditions,
    },
    guests: guestViews.map((g) => ({
      personId: g.personId,
      name: g.name,
      exclusive: exclusive.has(g.personId),
    })),
  };
}

function mergedBudget(event: Event, patch: EventPatch) {
  const stored = isBudgetKind(event.budgetKind) ? event.budgetKind : null;
  const kind = patch.budgetKind !== undefined ? patch.budgetKind : stored;
  const currency = patch.currency ?? event.currency;
  if (kind === "zero" || kind === "unlimited") {
    return {
      budgetKind: kind,
      budget: null,
      currency,
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    };
  }
  const replacing = patch.budget !== undefined;
  return {
    budgetKind: kind,
    budget: replacing ? (patch.budget ?? null) : event.budget,
    currency,
    budgetEur: replacing ? (patch.budgetEur ?? null) : event.budgetEur,
    budgetPln: replacing ? (patch.budgetPln ?? null) : event.budgetPln,
    budgetJpy: replacing ? (patch.budgetJpy ?? null) : event.budgetJpy,
  };
}

export async function updateEdition(
  event: Event,
  patch: EventPatch,
): Promise<Event> {
  const set: {
    name?: string;
    nameEn?: string | null;
    nameDe?: string | null;
    nameEs?: string | null;
    nameJa?: string | null;
    namePl?: string | null;
    occursOn?: string;
    location?: string | null;
    locationGdzie?: string | null;
    budgetKind?: BudgetKind | null;
    budget?: number | null;
    currency?: Currency;
    budgetEur?: number | null;
    budgetPln?: number | null;
    budgetJpy?: number | null;
  } & Partial<Record<OptionalNameCaseField, string | null>> = {
    ...optionalNameCasesPatch(patch),
  };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.nameEn !== undefined) set.nameEn = normalizeNameCase(patch.nameEn);
  if (patch.nameDe !== undefined) set.nameDe = normalizeNameCase(patch.nameDe);
  if (patch.nameEs !== undefined) set.nameEs = normalizeNameCase(patch.nameEs);
  if (patch.nameJa !== undefined) set.nameJa = normalizeNameCase(patch.nameJa);
  if (patch.namePl !== undefined) set.namePl = normalizeNameCase(patch.namePl);
  if (patch.location !== undefined) {
    set.location = normalizeLocation(patch.location);
  }
  if (patch.locationGdzie !== undefined) {
    set.locationGdzie = normalizeLocation(patch.locationGdzie);
  }
  if (patch.occursOn !== undefined) {
    const missing = missingEventDateMessage(patch.occursOn);
    if (missing) throw new EventError(missing);
    if (!isValidOccursOn(patch.occursOn)) {
      throw new EventError("Date must be YYYY-MM-DD.");
    }
    set.occursOn = patch.occursOn;
  }
  const budgetTouched =
    patch.budgetKind !== undefined ||
    patch.budget !== undefined ||
    patch.currency !== undefined ||
    patch.budgetEur !== undefined ||
    patch.budgetPln !== undefined ||
    patch.budgetJpy !== undefined;
  if (Object.keys(set).length === 0 && !budgetTouched) return event;

  const dateMessage = missingEventDateMessage(set.occursOn ?? event.occursOn);
  if (dateMessage) throw new EventError(dateMessage);

  const translationMessage = missingEventTranslationsMessage({
    namePl:
      patch.namePl !== undefined ? normalizeNameCase(patch.namePl) : event.namePl,
    nameDe:
      patch.nameDe !== undefined ? normalizeNameCase(patch.nameDe) : event.nameDe,
    nameEs:
      patch.nameEs !== undefined ? normalizeNameCase(patch.nameEs) : event.nameEs,
    nameJa:
      patch.nameJa !== undefined ? normalizeNameCase(patch.nameJa) : event.nameJa,
  });
  if (translationMessage) throw new EventError(translationMessage);

  const caseMessage = missingEventNameCasesMessage({
    ...event,
    ...optionalNameCasesPatch(patch),
  });
  if (caseMessage) throw new EventError(caseMessage);

  const locationMessage = missingEventLocationMessage({ ...event, ...set });
  if (locationMessage) throw new EventError(locationMessage);

  const budget = mergedBudget(event, patch);
  const budgetMessage = budgetChoiceError(budget);
  if (budgetMessage) throw new EventError(budgetMessage);
  set.budgetKind = budget.budgetKind;
  set.budget = budget.budget;
  set.currency = budget.currency;
  set.budgetEur = budget.budgetEur;
  set.budgetPln = budget.budgetPln;
  set.budgetJpy = budget.budgetJpy;

  const [updated] = await db
    .update(schema.event)
    .set(set)
    .where(eq(schema.event.id, event.id))
    .returning();
  return updated ?? event;
}

export async function deleteEdition(
  event: Event,
  deletePersonIds: number[] = [],
): Promise<void> {
  const draws = await db
    .select({ id: schema.draw.id, status: schema.draw.status })
    .from(schema.draw)
    .where(eq(schema.draw.eventId, event.id));
  if (draws.some((d) => d.status === "completed")) {
    throw new EventError("Cannot delete an edition that has completed draws.");
  }

  const seriesId = event.seriesId;
  const photos: (string | null)[] = [];
  db.transaction((tx) => {
    if (deletePersonIds.length > 0) {
      const { exclusive, notSeated, shared } = peopleExclusiveToEvent(
        event.id,
        deletePersonIds,
        tx,
      );
      if (notSeated.length > 0) {
        throw new EventError("Cannot delete a guest who is not in this event.");
      }
      if (shared.length > 0) {
        throw new EventError("Cannot delete a guest who is in another event.");
      }
      if (exclusive.length > 0) {
        const rows = tx
          .select({ photo: schema.person.photo })
          .from(schema.person)
          .where(inArray(schema.person.id, exclusive))
          .all();
        for (const row of rows) photos.push(row.photo);
        tx.delete(schema.person)
          .where(inArray(schema.person.id, exclusive))
          .run();
      }
    }

    tx.delete(schema.event).where(eq(schema.event.id, event.id)).run();
    const remaining = tx
      .select({ id: schema.event.id })
      .from(schema.event)
      .where(eq(schema.event.seriesId, seriesId))
      .all();
    if (remaining.length === 0) {
      tx.delete(schema.eventSeries)
        .where(eq(schema.eventSeries.id, seriesId))
        .run();
    }
  });

  for (const photo of photos) {
    await deletePhoto(photo);
  }
}
