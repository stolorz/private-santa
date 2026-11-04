import "server-only";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, schema, type DbHandle } from "@/lib/db";
import { asNameCases } from "@/lib/name-cases";
import { isValidOccursOn } from "@/lib/occurs-on";
import type { PastGift } from "@/lib/reveal";

export type ListPastGiftsInput = {
  personId: number;
  seriesId: number;
  occursOn: string;
  drawId: number;
};

/**
 * Gifts this person prepared in earlier editions of the same series.
 * Uses each past edition's newest draw (the current lottery), current
 * person names, and does not require the receiver to be seated this year.
 */
export function listPastGiftsForGiverOn(
  handle: DbHandle,
  input: ListPastGiftsInput,
): PastGift[] {
  const giverGuest = alias(schema.guest, "past_giver");
  const receiverGuest = alias(schema.guest, "past_receiver");
  const receiverPerson = alias(schema.person, "past_receiver_person");
  const pastDraw = alias(schema.draw, "past_draw");
  const pastEvent = alias(schema.event, "past_event");

  const rows = handle
    .select({
      eventId: pastEvent.id,
      occursOn: pastEvent.occursOn,
      drawId: pastDraw.id,
      drawCreatedAt: pastDraw.createdAt,
      person: receiverPerson,
    })
    .from(schema.assignment)
    .innerJoin(pastDraw, eq(schema.assignment.drawId, pastDraw.id))
    .innerJoin(pastEvent, eq(pastDraw.eventId, pastEvent.id))
    .innerJoin(giverGuest, eq(schema.assignment.giverId, giverGuest.id))
    .innerJoin(
      receiverGuest,
      eq(schema.assignment.receiverId, receiverGuest.id),
    )
    .innerJoin(receiverPerson, eq(receiverGuest.personId, receiverPerson.id))
    .where(
      and(
        eq(giverGuest.personId, input.personId),
        eq(pastEvent.seriesId, input.seriesId),
        lt(pastEvent.occursOn, input.occursOn),
        ne(pastDraw.id, input.drawId),
      ),
    )
    .orderBy(
      desc(pastEvent.occursOn),
      desc(pastDraw.createdAt),
      desc(pastDraw.id),
    )
    .all();

  const seenEvents = new Set<number>();
  const gifts: PastGift[] = [];
  for (const row of rows) {
    if (seenEvents.has(row.eventId)) continue;
    seenEvents.add(row.eventId);
    if (!isValidOccursOn(row.occursOn)) continue;
    gifts.push({
      ...asNameCases(row.person),
      year: row.occursOn.slice(0, 4),
      personId: row.person.id,
    });
  }
  return gifts;
}

export async function listPastGiftsForGiver(
  input: ListPastGiftsInput,
): Promise<PastGift[]> {
  return listPastGiftsForGiverOn(db, input);
}
