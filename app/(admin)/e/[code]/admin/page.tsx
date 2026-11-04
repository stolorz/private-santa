import { notFound } from "next/navigation";
import { EventSettingsForm } from "@/components/events/event-settings";
import { getEventWithSeriesByCode } from "@/lib/events";
import { requireAdminPage } from "@/lib/session";

export default async function EventAdminGeneralPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();
  return <EventSettingsForm event={found.event} />;
}
