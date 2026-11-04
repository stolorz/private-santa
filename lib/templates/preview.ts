import type { BudgetKind, BudgetSnapshot } from "@/lib/budget";
import { dateVars } from "@/lib/event-date";
import { eventNominative, eventVars } from "@/lib/event-name";
import { asNameCases, nameVars } from "@/lib/name-cases";
import { apiPath, guestPortalUrl } from "@/lib/public-path";
import type { PastGift, RevealedMatch } from "@/lib/reveal";
import {
  EMAIL_BANNER_PATH,
  INVITATION_EMAIL_FIELDS,
  renderEmail,
  WISHLIST_EMAIL_FIELDS,
  WISHLIST_SIGNAL_BODY,
  type EmailFieldIds,
  type RenderedEmail,
} from "./email";
import {
  type TemplateId,
  type TemplateItemId,
  type TemplatesView,
} from "./fields";
import { renderTemplate, revealCopy, type RevealCopy } from "./render";
import {
  PREVIEW_EVENTS,
  PREVIEW_GUESTS,
  type PreviewEvent,
  type PreviewGuest,
} from "./preview-fixtures";
import { budgetCopy, invitationVars } from "./vars";

/** Not a reserved first segment, and 6 characters of `[0-9a-z]`. */
export const PREVIEW_REVEAL_TOKEN = "prevw1";

export const PREVIEW_PORTAL_URL = guestPortalUrl(
  "https://santa.example",
  PREVIEW_REVEAL_TOKEN,
);

export type PreviewSample = {
  event: PreviewEvent;
  giver: PreviewGuest;
  receiver: PreviewGuest;
};

export type PreviewRevealStage =
  | "wrapped"
  | "unwrapping"
  | "unwrapped"
  | "not-found"
  | "error";

export type PreviewSurface =
  | { kind: "email"; fields?: EmailFieldIds }
  | { kind: "signal"; bodyId?: TemplateId }
  | { kind: "push"; titleId: TemplateId; bodyId: TemplateId }
  | { kind: "reveal"; stage: PreviewRevealStage };

export type RevealPreview = {
  stage: PreviewRevealStage;
  copy: RevealCopy;
  budget: string | null;
  eventTitle: string;
  match: RevealedMatch | null;
  ownWishlist: readonly string[];
  previousGifts: readonly PastGift[];
};

function randomIndex(rng: () => number, length: number): number {
  const index = Math.floor(rng() * length);
  if (!Number.isFinite(index) || index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function sameSample(a: PreviewSample, b: PreviewSample): boolean {
  return (
    a.event.id === b.event.id &&
    a.giver.id === b.giver.id &&
    a.receiver.id === b.receiver.id
  );
}

function drawSample(rng: () => number): PreviewSample {
  const event = PREVIEW_EVENTS[randomIndex(rng, PREVIEW_EVENTS.length)]!;
  const roster = event.guests;
  const giver = roster[randomIndex(rng, roster.length)]!;
  const others = roster.filter((guest) => guest.id !== giver.id);
  const receiver = others[randomIndex(rng, others.length)]!;
  return { event, giver, receiver };
}

/**
 * Random event, then two different people from its roster.
 * A repeat of `previous` advances to another edition.
 */
export function pickPreviewSample(
  rng: () => number,
  previous?: PreviewSample | null,
): PreviewSample {
  const drawn = drawSample(rng);
  if (previous == null || !sameSample(drawn, previous)) return drawn;
  const current = PREVIEW_EVENTS.findIndex((event) => event.id === drawn.event.id);
  const event = PREVIEW_EVENTS[(current + 1) % PREVIEW_EVENTS.length]!;
  return {
    event,
    giver: event.guests[0]!,
    receiver: event.guests[1]!,
  };
}

export function previewPhotoUrl(
  filename: string | null | undefined,
): string | null {
  const name = filename?.trim();
  if (!name) return null;
  return apiPath(`/preview/guests/${encodeURIComponent(name)}`);
}

export function previewBannerUrl(): string {
  return apiPath(EMAIL_BANNER_PATH);
}

export function previewBudgetLabel(kind: BudgetKind): string {
  if (kind === "zero") return "Make the gift";
  if (kind === "unlimited") return "No spending limit";
  return "Set a budget";
}

export function previewSurface(itemId: TemplateItemId): PreviewSurface {
  switch (itemId) {
    case "email.invitation":
    case "email.button":
    case "email.budget_line":
      return { kind: "email" };
    case "email.wishlist_added":
    case "email.wishlist_button":
      return { kind: "email", fields: WISHLIST_EMAIL_FIELDS.added };
    case "email.wishlist_removed":
      return { kind: "email", fields: WISHLIST_EMAIL_FIELDS.removed };
    case "email.wishlist_changed":
      return { kind: "email", fields: WISHLIST_EMAIL_FIELDS.changed };
    case "signal.message":
      return { kind: "signal" };
    case "signal.wishlist_added":
      return { kind: "signal", bodyId: WISHLIST_SIGNAL_BODY.added };
    case "signal.wishlist_removed":
      return { kind: "signal", bodyId: WISHLIST_SIGNAL_BODY.removed };
    case "signal.wishlist_changed":
      return { kind: "signal", bodyId: WISHLIST_SIGNAL_BODY.changed };
    case "push.opened":
      return {
        kind: "push",
        titleId: "push.opened.title",
        bodyId: "push.opened.body",
      };
    case "push.revealed":
      return {
        kind: "push",
        titleId: "push.revealed.title",
        bodyId: "push.revealed.body",
      };
    case "push.wishlist_added":
      return {
        kind: "push",
        titleId: "push.wishlist_added.title",
        bodyId: "push.wishlist_added.body",
      };
    case "push.wishlist_read":
      return {
        kind: "push",
        titleId: "push.wishlist_read.title",
        bodyId: "push.wishlist_read.body",
      };
    case "reveal.greeting":
    case "reveal.unwrap":
    case "reveal.unwrap_button":
      return { kind: "reveal", stage: "wrapped" };
    case "reveal.revealed_title":
    case "reveal.budget":
    case "reveal.wishlist":
    case "reveal.own_wishlist":
    case "reveal.previous_years":
      return { kind: "reveal", stage: "unwrapped" };
    case "reveal.not_found":
      return { kind: "reveal", stage: "not-found" };
    case "reveal.unwrap_error":
      return { kind: "reveal", stage: "error" };
  }
}

function previewAmounts(event: PreviewEvent): BudgetSnapshot {
  return {
    budgetKind: event.budgetKind,
    budget: event.budget,
    currency: event.currency,
    budgetEur: event.budgetEur,
    budgetPln: event.budgetPln,
    budgetJpy: event.budgetJpy,
  };
}

export function previewInvitationVars(
  view: TemplatesView,
  language: string,
  sample: PreviewSample,
) {
  return invitationVars(view, language, {
    giver: sample.giver,
    event: sample.event,
    occursOn: sample.event.occursOn,
    location: sample.event,
    url: PREVIEW_PORTAL_URL,
    amounts: previewAmounts(sample.event),
    guestCount: sample.event.guestIds.length,
  });
}

export function buildEmailPreview(
  view: TemplatesView,
  language: string,
  sample: PreviewSample,
  fields: EmailFieldIds = INVITATION_EMAIL_FIELDS,
): RenderedEmail {
  return renderEmail(view, language, previewInvitationVars(view, language, sample), {
    bannerSrc: previewBannerUrl(),
    fields,
  });
}

export function buildSignalPreview(
  view: TemplatesView,
  language: string,
  sample: PreviewSample,
  bodyId: TemplateId = "signal.body",
): string {
  return renderTemplate(
    view,
    bodyId,
    language,
    previewInvitationVars(view, language, sample),
  );
}

export function buildPushPreview(
  view: TemplatesView,
  language: string,
  sample: PreviewSample,
  field: { titleId: TemplateId; bodyId: TemplateId },
): { title: string; body: string } {
  const vars = previewInvitationVars(view, language, sample);
  return {
    title: renderTemplate(view, field.titleId, language, vars),
    body: renderTemplate(view, field.bodyId, language, vars),
  };
}

function previewPersonId(id: string): number {
  return PREVIEW_GUESTS.findIndex((guest) => guest.id === id) + 1;
}

function previousGiftsFor(sample: PreviewSample): PastGift[] {
  const rows = sample.event.previousGifts ?? [];
  return rows
    .filter((row) => row.giverId === sample.giver.id)
    .slice()
    .sort((a, b) => b.year - a.year || a.receiverId.localeCompare(b.receiverId))
    .flatMap((row) => {
      const receiver = PREVIEW_GUESTS.find((guest) => guest.id === row.receiverId);
      if (!receiver) return [];
      return [
        {
          ...asNameCases(receiver),
          year: String(row.year),
          personId: previewPersonId(receiver.id),
        },
      ];
    });
}

function toRevealedMatch(guest: PreviewGuest): RevealedMatch {
  return {
    name: guest.name,
    nameDopelniacz: guest.nameDopelniacz,
    nameCelownik: guest.nameCelownik,
    nameBiernik: guest.nameBiernik,
    nameNarzednik: guest.nameNarzednik,
    nameMiejscownik: guest.nameMiejscownik,
    nameWolacz: guest.nameWolacz,
    gender: guest.gender,
    photo: guest.photo,
    wishlist: guest.wishlist.map((text, index) => ({ id: index + 1, text })),
  };
}

/** Same giver / event / date / budget shape as the guest reveal page. */
export function buildRevealPreview(
  view: TemplatesView,
  language: string,
  sample: PreviewSample,
  stage: PreviewRevealStage,
): RevealPreview {
  const money = budgetCopy(view, language, previewAmounts(sample.event));
  const rendered = revealCopy(view, language, {
    ...nameVars("giver", sample.giver),
    ...eventVars(sample.event, language),
    ...dateVars(sample.event.occursOn, language),
    budget: money.budget,
  });
  const budget = money.revealLabel;
  return {
    stage,
    copy: budget ? { ...rendered, budgetLabel: budget } : rendered,
    budget,
    eventTitle: eventNominative(sample.event, language),
    match: stage === "unwrapped" ? toRevealedMatch(sample.receiver) : null,
    ownWishlist: sample.giver.wishlist,
    previousGifts: previousGiftsFor(sample),
  };
}
