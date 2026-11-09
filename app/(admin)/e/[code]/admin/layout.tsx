import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/event-admin/admin-nav";
import { TemplateErrorCountProvider } from "@/components/settings/template-error-count";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { eventLabel } from "@/lib/event-code";
import { getEventWithSeriesByCode } from "@/lib/events";
import { eventOgCopy, metadataFromOg } from "@/lib/og";
import { countEventPhotos } from "@/lib/gallery/store";
import { guestsForEvent } from "@/lib/people";
import { getOgSettings } from "@/lib/settings";
import { requireAdminPage } from "@/lib/session";
import { getEventTemplates } from "@/lib/templates/store";
import { templateErrorTotal } from "@/lib/templates/validate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const [og, found] = await Promise.all([
    getOgSettings(),
    getEventWithSeriesByCode(code),
  ]);
  if (!found) return metadataFromOg(og);
  return metadataFromOg(og, eventOgCopy(eventLabel(found.event)));
}

export default async function EventAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();

  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();
  const [guests, templates, photoCount] = await Promise.all([
    guestsForEvent(found.event.id),
    getEventTemplates(found.event.id),
    countEventPhotos(found.event.id),
  ]);
  const templateErrors = templateErrorTotal(templates);

  return (
    <PageShell>
      <PageHeader
        title={eventLabel(found.event)}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/events">Events</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">Settings</Link>
            </Button>
          </>
        }
      />
      <TemplateErrorCountProvider count={templateErrors}>
        <AdminNav
          code={found.event.code}
          guestCount={guests.length}
          photoCount={photoCount}
        />
        {children}
      </TemplateErrorCountProvider>
    </PageShell>
  );
}
