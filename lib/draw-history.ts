import "server-only";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { HistoryLayer } from "@/lib/draw";
import { db, schema, type DbHandle } from "@/lib/db";
import type { Event } from "@/lib/db/schema";

/**
 * History soft-constraint: pairings from earlier draws, grouped into
 * layers (one per draw) **oldest first** so the solver can drop the
 * oldest year first. `recentDraws` is expected newest-first.
 */
export function historyPairsForDraw(
  currentDrawId: number,
  recentDraws: Array<{ id: number }>,
  assignments: Array<{
    drawId: number;
    giverId: number;
    receiverId: number;
  }>,
): HistoryLayer[] {
  const selected = recentDraws.filter((d) => d.id !== currentDrawId);
  if (selected.length === 0) return [];

  const byDraw = new Map<number, HistoryLayer>();
  for (const h of assignments) {
    let layer = byDraw.get(h.drawId);
    if (!layer) {
      layer = [];
      byDraw.set(h.drawId, layer);
    }
    layer.push([h.giverId, h.receiverId]);
  }

  // Reverse the newest-first list so the solver drops oldest years first.
  const layers: HistoryLayer[] = [];
  for (const d of [...selected].reverse()) {
    const layer = byDraw.get(d.id);
    if (layer && layer.length > 0) layers.push(layer);
  }
  return layers;
}

/**
 * Past pairings in this series, remapped onto the current edition's guest
 * ids, oldest `occursOn` first so the solver drops the oldest year first.
 */
export function pastPairingLayers(
  tx: DbHandle,
  event: Event,
  drawId = 0,
): HistoryLayer[] {
  const pastDraw = alias(schema.draw, "past_draw");
  const pastEvent = alias(schema.event, "past_event");
  const giverGuest = alias(schema.guest, "hist_giver");
  const receiverGuest = alias(schema.guest, "hist_receiver");
  const currentGiver = alias(schema.guest, "current_giver");
  const currentReceiver = alias(schema.guest, "current_receiver");

  const rows = tx
    .select({
      drawId: pastDraw.id,
      giverId: currentGiver.id,
      receiverId: currentReceiver.id,
    })
    .from(schema.assignment)
    .innerJoin(pastDraw, eq(schema.assignment.drawId, pastDraw.id))
    .innerJoin(pastEvent, eq(pastDraw.eventId, pastEvent.id))
    .innerJoin(giverGuest, eq(schema.assignment.giverId, giverGuest.id))
    .innerJoin(
      receiverGuest,
      eq(schema.assignment.receiverId, receiverGuest.id),
    )
    .innerJoin(
      currentGiver,
      and(
        eq(currentGiver.personId, giverGuest.personId),
        eq(currentGiver.eventId, event.id),
      ),
    )
    .innerJoin(
      currentReceiver,
      and(
        eq(currentReceiver.personId, receiverGuest.personId),
        eq(currentReceiver.eventId, event.id),
      ),
    )
    .where(
      and(
        eq(pastEvent.seriesId, event.seriesId),
        lt(pastEvent.occursOn, event.occursOn),
        ne(pastDraw.id, drawId),
      ),
    )
    .orderBy(desc(pastEvent.occursOn), desc(pastDraw.id))
    .all();

  const recentDraws: Array<{ id: number }> = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.drawId)) continue;
    seen.add(row.drawId);
    recentDraws.push({ id: row.drawId });
  }
  return historyPairsForDraw(drawId, recentDraws, rows);
}

export async function listPastPairings(
  event: Event,
): Promise<Array<[number, number]>> {
  return pastPairingLayers(db, event).flat();
}
