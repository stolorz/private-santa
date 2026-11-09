import type { Metadata } from "next";
import { WinterPage } from "@/components/festive/winter-page";
import { PhotoGallery } from "@/components/reveal/photo-gallery";
import { dateVars } from "@/lib/event-date";
import { eventNameFieldsFrom, eventVars } from "@/lib/event-name";
import { galleryEventForLink } from "@/lib/gallery/access";
import { listReadyPhotos } from "@/lib/gallery/store";
import { guestLinkByToken } from "@/lib/guest-link";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import { nameVars } from "@/lib/name-cases";
import { guestRevealMetadata } from "@/lib/og";
import { getOgSettings } from "@/lib/settings";
import { revealCopy } from "@/lib/templates";
import { templatesForGuestPage } from "@/lib/templates/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const [og, link] = await Promise.all([
    getOgSettings(),
    guestLinkByToken(token),
  ]);
  return guestRevealMetadata(og, link);
}

export default async function GuestGalleryPage({
  params,
}: {
  params: Promise<{ token: string; code: string }>;
}) {
  const { token, code } = await params;
  const link = await guestLinkByToken(token);
  const event = link ? await galleryEventForLink(link, code) : null;
  if (!link || !event) {
    const copy = revealCopy(await templatesForGuestPage(null), DEFAULT_LANGUAGE);
    return (
      <WinterPage
        brand={false}
        sprig={false}
        title={copy.notFoundTitle}
        subtitle={copy.notFoundDescription}
      />
    );
  }

  const [photos, templates] = await Promise.all([
    listReadyPhotos(event.id),
    templatesForGuestPage(link.draw.eventId),
  ]);
  const fields = eventNameFieldsFrom(event, event.name);
  const copy = revealCopy(templates, link.giver.language, {
    ...nameVars("giver", link.giver),
    ...eventVars(fields, link.giver.language),
    ...dateVars(event.occursOn, link.giver.language),
    year: event.occursOn.slice(0, 4),
  });

  return (
    <WinterPage
      brand={false}
      sprig={false}
      wide
      title={copy.galleryTitle}
    >
      <PhotoGallery token={token} photos={photos} copy={copy} />
    </WinterPage>
  );
}
