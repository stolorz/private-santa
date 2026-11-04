import { notFound } from "next/navigation";
import { GuestsTab } from "@/components/event-admin/guests-tab";
import { getEventWithSeriesByCode } from "@/lib/events";
import { guestsForEvent, listPeopleWithEvents, otherEventSeatCounts } from "@/lib/people";
import { requireAdminPage } from "@/lib/session";

export default async function EventAdminGuestsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();

  const [guests, people] = await Promise.all([
    guestsForEvent(found.event.id),
    listPeopleWithEvents(),
  ]);
  const otherEventSeats = await otherEventSeatCounts(
    found.event.id,
    guests.map((guest) => guest.personId),
  );

  return (
    <GuestsTab
      code={found.event.code}
      guests={guests}
      otherEventSeats={otherEventSeats}
      people={people}
    />
  );
}
