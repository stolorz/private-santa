import {
  missingEventLocationSendReason,
  type EventLocationFields,
} from "@/lib/event-location";
import { missingEventTranslationsSendReason } from "@/lib/event-name";
import { isGender } from "@/lib/gender";
import { joinNames } from "@/lib/guest-contact";
import {
  missingConjugationReason,
  missingGenderReason,
} from "@/lib/invitation-channels";
import { missingNameCases } from "@/lib/name-cases";
import { compareNames } from "@/lib/person-name";

export type MatchWishlist = "yes" | "no" | "none";

export type DeliveryFlags = {
  whatsapp: boolean;
  signal: boolean;
  email: boolean;
  manual: boolean;
};

export type RevealLink = {
  giver: string;
  url: string;
  token: string;
  delivered: DeliveryFlags;
  emailFailed: boolean;
  emailFailedReason: string | null;
  opened: boolean;
  revealed: boolean;
  hasWishlist: boolean;
  matchWishlist: MatchWishlist;
  /** Why the copy control stays inactive. Null when the URL may be copied. */
  blockedReason: string | null;
};

export type RevealAssignment = {
  giverId: number;
  receiverId: number;
  revealToken: string;
  revealCount?: number;
  openedAt?: Date | null;
  wishlistSeenAt?: Date | null;
  deliveredWhatsapp?: boolean;
  deliveredSignal?: boolean;
  deliveredEmail?: boolean;
  deliveredManual?: boolean;
  emailFailed?: boolean;
  emailFailedReason?: string | null;
};

const CHANNEL_LABELS: Array<[keyof DeliveryFlags, string]> = [
  ["whatsapp", "WhatsApp"],
  ["signal", "Signal"],
  ["email", "Email"],
  ["manual", "Manual"],
];

export function emptyDelivery(): DeliveryFlags {
  return { whatsapp: false, signal: false, email: false, manual: false };
}

export function deliveryFlagsFrom(a: {
  deliveredWhatsapp?: boolean;
  deliveredSignal?: boolean;
  deliveredEmail?: boolean;
  deliveredManual?: boolean;
}): DeliveryFlags {
  return {
    whatsapp: a.deliveredWhatsapp === true,
    signal: a.deliveredSignal === true,
    email: a.deliveredEmail === true,
    manual: a.deliveredManual === true,
  };
}

export function anyDelivered(flags: DeliveryFlags): boolean {
  return flags.whatsapp || flags.signal || flags.email || flags.manual;
}

export function deliveryTooltip(
  flags: DeliveryFlags,
  opts?: { emailFailed?: boolean; emailFailedReason?: string | null },
): string {
  const labels = CHANNEL_LABELS.filter(([key]) => flags[key]).map(
    ([, label]) => label,
  );
  const success =
    labels.length === 0 ? "Not delivered" : `Delivered via ${joinNames(labels)}`;
  if (!opts?.emailFailed) return success;
  const fail = opts.emailFailedReason
    ? `Email delivery failed: ${opts.emailFailedReason}`
    : "Email delivery failed";
  if (labels.length === 0) return fail;
  return fail.endsWith(".") ? `${success}. ${fail}` : `${success}. ${fail}.`;
}

export const REVEAL_LINK_BLOCKED_STEM =
  "The link to the reveal page cannot be generated because";

export type RevealLinkGuest = {
  id: number;
  name: string;
  gender?: string | null;
} & Parameters<typeof missingNameCases>[0];

function linkReason(detail: string): string {
  return `${REVEAL_LINK_BLOCKED_STEM} ${detail}`;
}

/** Turn a send-refusal sentence into the same fact about the reveal link. */
function fromSendReason(reason: string): string {
  const detail = reason.replace(/Cannot send .*? because /gi, "").trim();
  return linkReason(detail.charAt(0).toLowerCase() + detail.slice(1));
}

/**
 * Why this draw-list row must not expose a reveal URL.
 * Same missing-data order as invitation send: every seated guest's gender,
 * then every seated guest's Polish cases, then event-name translations,
 * then the event location, then templates that do not parse, then a
 * configured email template, then a configured Signal template.
 * A past date, a missing channel, and a missing phone or email are not reasons.
 */
export function revealLinkBlockedReason(input: {
  giverId: number;
  guests: readonly RevealLinkGuest[];
  event?:
    | (NonNullable<Parameters<typeof missingEventTranslationsSendReason>[0]> &
        Partial<EventLocationFields>)
    | null;
  missingEmailTemplateReason?: string | null;
  missingSignalTemplateReason?: string | null;
  invalidTemplatesReason?: string | null;
}): string | null {
  const giver = input.guests.find((guest) => guest.id === input.giverId);
  const missingGender = input.guests
    .filter((guest) => !isGender(guest.gender ?? ""))
    .map((guest) => guest.name)
    .sort(compareNames);
  if (missingGender.length > 0) {
    if (giver && !isGender(giver.gender ?? "")) {
      return linkReason("this guest's gender is not defined.");
    }
    return fromSendReason(missingGenderReason(missingGender)!);
  }

  const missingCases = input.guests
    .filter((guest) => missingNameCases(guest).length > 0)
    .map((guest) => guest.name)
    .sort(compareNames);
  if (missingCases.length > 0) {
    if (giver && missingNameCases(giver).length > 0) {
      return linkReason(
        `this guest is missing Polish cases: ${missingNameCases(giver).join(", ")}.`,
      );
    }
    return fromSendReason(missingConjugationReason(missingCases)!);
  }

  const translations = missingEventTranslationsSendReason(input.event);
  if (translations) return fromSendReason(translations);
  const location = missingEventLocationSendReason(input.event);
  if (location) return fromSendReason(location);
  if (input.invalidTemplatesReason) {
    return fromSendReason(input.invalidTemplatesReason);
  }
  if (input.missingEmailTemplateReason) {
    return fromSendReason(input.missingEmailTemplateReason);
  }
  if (input.missingSignalTemplateReason) {
    return fromSendReason(input.missingSignalTemplateReason);
  }
  return null;
}

export function matchWishlistStatus(
  receiverItemCount: number,
  seenAt: Date | null | undefined,
  updatedAt: Date | null | undefined,
): MatchWishlist {
  if (receiverItemCount === 0) return "none";
  if (
    seenAt != null &&
    (updatedAt == null || seenAt.getTime() >= updatedAt.getTime())
  ) {
    return "yes";
  }
  return "no";
}

export function toRevealLinks(
  assignments: RevealAssignment[],
  opts: {
    nameById: Map<number, string>;
    wishlistCountByGuestId: Map<number, number>;
    wishlistUpdatedAtByGuestId: Map<number, Date | null>;
    urlFor: (token: string) => string;
    blockedReasonByGiverId?: ReadonlyMap<number, string | null>;
  },
): RevealLink[] {
  return assignments
    .map((a) => {
      const revealed = (a.revealCount ?? 0) > 0;
      const receiverCount = opts.wishlistCountByGuestId.get(a.receiverId) ?? 0;
      return {
        giver: opts.nameById.get(a.giverId) ?? `#${a.giverId}`,
        url: opts.urlFor(a.revealToken),
        token: a.revealToken,
        delivered: deliveryFlagsFrom(a),
        emailFailed: a.emailFailed === true,
        emailFailedReason: a.emailFailedReason ?? null,
        opened: a.openedAt != null || revealed,
        revealed,
        hasWishlist: (opts.wishlistCountByGuestId.get(a.giverId) ?? 0) > 0,
        matchWishlist: matchWishlistStatus(
          receiverCount,
          a.wishlistSeenAt,
          opts.wishlistUpdatedAtByGuestId.get(a.receiverId),
        ),
        blockedReason: opts.blockedReasonByGiverId?.get(a.giverId) ?? null,
      };
    })
    .sort((a, b) => compareNames(a.giver, b.giver));
}
