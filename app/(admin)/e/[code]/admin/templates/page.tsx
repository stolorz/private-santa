import { notFound } from "next/navigation";
import { TemplatesSettings } from "@/components/settings/templates-settings";
import { getEventWithSeriesByCode } from "@/lib/events";
import { eventApiPath } from "@/lib/public-path";
import { requireAdminPage } from "@/lib/session";
import { getEventTemplates, getTemplates } from "@/lib/templates/store";

export default async function EventAdminTemplatesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();

  const [initial, restoreDefaults] = await Promise.all([
    getEventTemplates(found.event.id),
    getTemplates(),
  ]);

  return (
    <TemplatesSettings
      initial={initial}
      saveUrl={eventApiPath(found.event.code, "/templates")}
      restoreDefaults={restoreDefaults}
    />
  );
}
