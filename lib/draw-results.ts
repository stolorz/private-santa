import "server-only";
import type { Event } from "@/lib/db/schema";
import {
  drawResultsFilename,
  renderDrawResultsCsv,
  type DrawResultRow,
} from "@/lib/draw-results-csv";
import { currentDrawWithAssignments } from "@/lib/pairings";
import { guestsForEvent } from "@/lib/people";

/** CSV archive of the edition's current draw, or null when there is no draw. */
export async function currentDrawResultsCsv(
  event: Pick<Event, "id" | "occursOn">,
): Promise<{ filename: string; body: string } | null> {
  const current = await currentDrawWithAssignments(event.id);
  if (!current) return null;

  const nameById = new Map(
    (await guestsForEvent(event.id)).map((guest) => [guest.id, guest.name]),
  );
  const rows: DrawResultRow[] = [];
  for (const assignment of current.assignments) {
    const giver = nameById.get(assignment.giverId);
    const receiver = nameById.get(assignment.receiverId);
    if (giver == null || receiver == null) continue;
    rows.push({ giver, receiver });
  }

  return {
    filename: drawResultsFilename(event.occursOn),
    body: renderDrawResultsCsv(rows),
  };
}
