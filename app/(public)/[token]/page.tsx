import type { Metadata } from "next";
import { getEventById } from "@/lib/events";
import { guestLinkByToken, isRevealed, loadRevealedMatch } from "@/lib/guest-link";
import { countReadyPhotos } from "@/lib/gallery/store";
import { listPastGiftsForGiver } from "@/lib/reveal-history";
import { revealPageSurfaces } from "@/lib/reveal";
import { listWishlistItems } from "@/lib/wishlist";
import { guestRevealMetadata } from "@/lib/og";
import { getOgSettings } from "@/lib/settings";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WinterCard, WinterPage } from "@/components/festive/winter-page";
import { ReceiverReveal } from "@/components/reveal/receiver-reveal";
import { WishlistEditor } from "@/components/reveal/wishlist-editor";
import { budgetCopyForGuests } from "@/lib/delivery/channels";
import { dateVars } from "@/lib/event-date";
import { templatesForGuestPage } from "@/lib/templates/store";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import { revealCopy } from "@/lib/templates";
import {
  eventNameFieldsFrom,
  eventNominative,
  eventVars,
} from "@/lib/event-name";
import { nameVars } from "@/lib/name-cases";

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

export default async function RevealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await guestLinkByToken(token);

  if (!link) {
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

  const { draw, giver, assignment } = link;
  const initiallyRevealed = isRevealed(assignment);
  const [eventRow, initialMatch, templates] = await Promise.all([
    getEventById(draw.eventId),
    initiallyRevealed ? loadRevealedMatch(link) : Promise.resolve(null),
    templatesForGuestPage(draw.eventId),
  ]);
  const { showOwnWishlist } = revealPageSurfaces(eventRow?.occursOn);
  // Wishlist rows and this year's ready count sit on opposite sides of
  // the party date. Previous-year gifts load either way.
  const [previousGifts, currentPhotoCount, mine] = await Promise.all([
    eventRow
      ? listPastGiftsForGiver({
          personId: giver.personId,
          seriesId: eventRow.seriesId,
          occursOn: eventRow.occursOn,
          drawId: draw.id,
        })
      : Promise.resolve([]),
    eventRow && !showOwnWishlist
      ? countReadyPhotos(eventRow.id)
      : Promise.resolve(0),
    showOwnWishlist ? listWishlistItems(giver.id) : Promise.resolve([]),
  ]);
  const budgetCopy = budgetCopyForGuests(
    templates,
    giver.language,
    draw,
    eventRow,
  );
  const budget = budgetCopy.revealLabel;
  const event = eventNameFieldsFrom(eventRow, draw.name);
  const rendered = revealCopy(templates, giver.language, {
    ...nameVars("giver", giver),
    ...eventVars(event, giver.language),
    ...dateVars(eventRow?.occursOn, giver.language),
    budget: budgetCopy.budget,
  });
  const copy = budget
    ? { ...rendered, budgetLabel: budget }
    : rendered;
  const eventTitle = eventNominative(event, giver.language);

  return (
    <WinterPage
      brand={false}
      sprig={false}
      title={copy.greeting}
      subtitle={eventTitle || undefined}
    >
      <ReceiverReveal
        token={token}
        budget={budget}
        copy={copy}
        initiallyRevealed={initiallyRevealed}
        initialMatch={initialMatch}
        previousGifts={previousGifts}
        currentEventCode={
          eventRow && currentPhotoCount > 0 ? eventRow.code : undefined
        }
      >
        {showOwnWishlist ? (
          <WinterCard>
            <CardHeader className="px-6 pt-7 pb-4 sm:px-8">
              <CardTitle className="text-xl text-foreground sm:text-2xl">
                {copy.ownWishlistTitle}
              </CardTitle>
              <CardDescription className="text-base">
                {copy.ownWishlistDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-7 sm:px-8">
              <WishlistEditor
                initial={mine}
                token={token}
                language={giver.language}
              />
            </CardContent>
          </WinterCard>
        ) : null}
      </ReceiverReveal>
    </WinterPage>
  );
}
