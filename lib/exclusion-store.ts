import "server-only";
import { and, eq } from "drizzle-orm";
import { db, first, schema, type DbHandle } from "@/lib/db";
import type { Exclusion } from "@/lib/db/schema";
import { hasExclusionPair } from "@/lib/exclusions";
import { EventError } from "@/lib/events";
import { guestsBelongToEvent } from "@/lib/people";
import { mustExist } from "@/lib/utils";

export function listExclusionsOn(
  eventId: number,
  handle: DbHandle = db,
): Exclusion[] {
  return handle
    .select()
    .from(schema.exclusion)
    .where(eq(schema.exclusion.eventId, eventId))
    .all();
}

export async function listExclusions(eventId: number): Promise<Exclusion[]> {
  return listExclusionsOn(eventId);
}

export async function addExclusion(
  eventId: number,
  aId: number,
  bId: number,
): Promise<Exclusion> {
  if (!(await guestsBelongToEvent(eventId, [aId, bId]))) {
    throw new EventError("Both people must belong to this edition.");
  }
  const existing = await listExclusions(eventId);
  if (hasExclusionPair(existing, aId, bId)) {
    throw new EventError("That pair is already excluded.");
  }
  const [left, right] = aId <= bId ? [aId, bId] : [bId, aId];
  const row = await first(
    db
      .insert(schema.exclusion)
      .values({ eventId, aId: left, bId: right })
      .returning(),
  );
  return mustExist(row, "Could not create exclusion.");
}

export async function removeExclusion(
  eventId: number,
  id: number,
): Promise<void> {
  await db
    .delete(schema.exclusion)
    .where(
      and(eq(schema.exclusion.id, id), eq(schema.exclusion.eventId, eventId)),
    );
}
