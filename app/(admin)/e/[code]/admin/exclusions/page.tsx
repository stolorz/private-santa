import { notFound } from "next/navigation";
import { ExclusionsTab } from "@/components/event-admin/exclusions-tab";
import { listExclusions } from "@/lib/exclusion-store";
import { getEventWithSeriesByCode, hasEarlierEdition } from "@/lib/events";
import { guestsForEvent } from "@/lib/people";
import { requireAdminPage } from "@/lib/session";

export default async function EventAdminExclusionsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();
  const { event, series } = found;

  const [guests, exclusions, hasPastEditions] = await Promise.all([
    guestsForEvent(event.id),
    listExclusions(event.id),
    hasEarlierEdition(series.id, event),
  ]);

  return (
    <ExclusionsTab
      code={event.code}
      guests={guests}
      exclusions={exclusions}
      allowSelfDraw={event.allowSelfDraw}
      avoidPastPairings={event.avoidPastPairings}
      hasPastEditions={hasPastEditions}
    />
  );
}
