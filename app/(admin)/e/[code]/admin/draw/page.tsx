import { notFound } from "next/navigation";
import { DrawTab } from "@/components/event-admin/draw-tab";
import { listPastPairings } from "@/lib/draw-history";
import { listExclusions } from "@/lib/exclusion-store";
import { getEventWithSeriesByCode, hasEarlierEdition } from "@/lib/events";
import { getCurrentDraw } from "@/lib/pairings";
import { guestsForEvent } from "@/lib/people";
import { requireAdminPage } from "@/lib/session";

export default async function EventAdminDrawPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();
  const { event, series } = found;

  const [guests, exclusions, currentDraw, hasPastEditions, pastPairings] =
    await Promise.all([
      guestsForEvent(event.id),
      listExclusions(event.id),
      getCurrentDraw(event.id),
      hasEarlierEdition(series.id, event),
      listPastPairings(event),
    ]);

  return (
    <DrawTab
      key={currentDraw?.draw.id ?? "none"}
      code={event.code}
      guests={guests}
      exclusions={exclusions}
      currentDraw={currentDraw}
      hasPastEditions={hasPastEditions}
      allowSelfDraw={event.allowSelfDraw}
      avoidPastPairings={event.avoidPastPairings}
      pastPairings={pastPairings}
      occursOn={event.occursOn}
    />
  );
}
