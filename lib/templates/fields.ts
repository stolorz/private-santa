import {
  DATE_PLACEHOLDER_LABELS,
  DATE_PLACEHOLDERS,
  type DatePlaceholder,
} from "@/lib/event-date";
import {
  LOCATION_PLACEHOLDER_LABELS,
  LOCATION_PLACEHOLDERS,
  type LocationPlaceholder,
} from "@/lib/event-location";
import { GENDER_CODES } from "@/lib/gender";
import { languageLabel, type Language } from "@/lib/language";
import {
  EVENT_NAME_PLACEHOLDERS,
  GIVER_NAME_PLACEHOLDERS,
  RECEIVER_NAME_PLACEHOLDERS,
} from "@/lib/name-cases";
import type { BudgetKind } from "@/lib/budget";
import { compareNames } from "@/lib/person-name";
import deDefaults from "./defaults/de.json";
import enDefaults from "./defaults/en.json";
import esDefaults from "./defaults/es.json";
import jaDefaults from "./defaults/ja.json";
import plDefaults from "./defaults/pl.json";

export const TEMPLATE_LANGUAGES = [
  "en",
  "pl",
  "de",
  "es",
  "ja",
] as const satisfies readonly Language[];
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number];

export const TEMPLATE_GROUPS = [
  {
    id: "email",
    label: "Email",
    description: "Sent to guests with their private link.",
  },
  {
    id: "signal",
    label: "Signal",
    description:
      "Sent to guests over Signal. WhatsApp uses the Meta template set under Integrations.",
  },
  {
    id: "push",
    label: "Push",
    description: "Sent to you when guests act on their link.",
  },
  {
    id: "reveal",
    label: "Reveal page",
    description: "Shown to guests on their private page.",
  },
] as const;

export type TemplateGroupId = (typeof TEMPLATE_GROUPS)[number]["id"];

/** Related fields edited together under one heading, e.g. a title and body. */
export const TEMPLATE_ITEMS = [
  {
    id: "email.invitation",
    group: "email",
    label: "Invitation",
    hint: "In HTML mail a short one-line first paragraph, like the greeting, is shown as the heading.",
  },
  {
    id: "email.button",
    group: "email",
    label: "Button",
    hint: "Inserted as {button} in the body. Rendered as a large button in HTML mail, and as the label plus URL in plain text.",
  },
  {
    id: "email.budget_line",
    group: "email",
    label: "Budget line",
    hint: "Inserted as {budget_line}. The amount, make-the-gift, and no-limit lines are chosen from the edition. Leave a leading space if you want one before the sentence.",
  },
  {
    id: "email.wishlist_added",
    group: "email",
    label: "Wishlist added",
    hint: "Sent to the giver once, until they view the list. Do not name the receiver or quote the wish.",
  },
  {
    id: "email.wishlist_removed",
    group: "email",
    label: "Wishlist removed",
    hint: "Sent to the giver once, until they view the list. Do not name the receiver or quote the wish.",
  },
  {
    id: "email.wishlist_changed",
    group: "email",
    label: "Wishlist changed",
    hint: "Sent to the giver once, until they view the list. Do not name the receiver or quote the wish.",
  },
  {
    id: "email.wishlist_button",
    group: "email",
    label: "Wishlist button",
    hint: "Inserted as {button} in the wishlist-change emails. Shared by added, removed, and changed.",
  },
  { id: "signal.message", group: "signal", label: "Message" },
  {
    id: "signal.wishlist_added",
    group: "signal",
    label: "Wishlist added",
    hint: "Sent to the giver once, until they view the list. Include {url}. Do not name the receiver or quote the wish.",
  },
  {
    id: "signal.wishlist_removed",
    group: "signal",
    label: "Wishlist removed",
    hint: "Sent to the giver once, until they view the list. Include {url}. Do not name the receiver or quote the wish.",
  },
  {
    id: "signal.wishlist_changed",
    group: "signal",
    label: "Wishlist changed",
    hint: "Sent to the giver once, until they view the list. Include {url}. Do not name the receiver or quote the wish.",
  },
  {
    id: "push.opened",
    group: "push",
    label: "Opened",
    hint: "Sent to you when a guest first opens their private link.",
  },
  {
    id: "push.revealed",
    group: "push",
    label: "Unwrapped",
    hint: "Sent to you when a guest unwraps their match.",
  },
  {
    id: "push.wishlist_added",
    group: "push",
    label: "Wishlist added",
    hint: "Sent to you when a guest adds an item to their own list. Do not include the item text.",
  },
  {
    id: "push.wishlist_read",
    group: "push",
    label: "Wishlist viewed",
    hint: "Sent to you when a guest first sees their match's list since it last changed.",
  },
  { id: "reveal.greeting", group: "reveal", label: "Greeting" },
  { id: "reveal.unwrap", group: "reveal", label: "Unwrap" },
  { id: "reveal.unwrap_button", group: "reveal", label: "Unwrap button" },
  {
    id: "reveal.revealed_title",
    group: "reveal",
    label: "Revealed title",
    hint: "Intro line above the large name. Put {receiver} or a Polish case in Revealed name, not in the title.",
  },
  { id: "reveal.budget", group: "reveal", label: "Budget line" },
  { id: "reveal.wishlist", group: "reveal", label: "Their wishlist" },
  { id: "reveal.own_wishlist", group: "reveal", label: "Own wishlist" },
  { id: "reveal.not_found", group: "reveal", label: "Invalid link" },
  { id: "reveal.unwrap_error", group: "reveal", label: "Unwrap error" },
  {
    id: "reveal.previous_years",
    group: "reveal",
    label: "Previous years",
    hint: "Shown after unwrap when this guest gave a gift in an earlier edition of the same series.",
  },
  {
    id: "reveal.photos",
    group: "reveal",
    label: "Photos",
    hint: "Button and titles for edition photo galleries. Guests open them from their private link.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  group: TemplateGroupId;
  label: string;
  hint?: string;
}>;

export type TemplateItemId = (typeof TEMPLATE_ITEMS)[number]["id"];

export const TEMPLATE_FIELDS = [
  {
    id: "email.subject",
    item: "email.invitation",
    label: "Subject",
    kind: "input",
    placeholders: [
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
      ...LOCATION_PLACEHOLDERS,
    ],
  },
  {
    id: "email.body",
    item: "email.invitation",
    label: "Body",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
      ...LOCATION_PLACEHOLDERS,
      "url",
      "button",
      "budget_line",
      "guest_count",
    ],
  },
  {
    id: "email.button",
    item: "email.button",
    label: "Button",
    kind: "input",
    placeholders: [],
  },
  {
    id: "email.budget_line",
    item: "email.budget_line",
    label: "Budget line",
    kind: "input",
    placeholders: ["budget"],
  },
  {
    id: "email.budget_zero",
    item: "email.budget_line",
    label: "Make-the-gift line",
    kind: "input",
    placeholders: [],
  },
  {
    id: "email.budget_unlimited",
    item: "email.budget_line",
    label: "No-limit line",
    kind: "input",
    placeholders: [],
  },
  {
    id: "email.wishlist_added.subject",
    item: "email.wishlist_added",
    label: "Subject",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS],
  },
  {
    id: "email.wishlist_added.body",
    item: "email.wishlist_added",
    label: "Body",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS, "url", "button"],
  },
  {
    id: "email.wishlist_removed.subject",
    item: "email.wishlist_removed",
    label: "Subject",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS],
  },
  {
    id: "email.wishlist_removed.body",
    item: "email.wishlist_removed",
    label: "Body",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS, "url", "button"],
  },
  {
    id: "email.wishlist_changed.subject",
    item: "email.wishlist_changed",
    label: "Subject",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS],
  },
  {
    id: "email.wishlist_changed.body",
    item: "email.wishlist_changed",
    label: "Body",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS, "url", "button"],
  },
  {
    id: "email.wishlist_button",
    item: "email.wishlist_button",
    label: "Button",
    kind: "input",
    placeholders: [],
  },
  {
    id: "signal.body",
    item: "signal.message",
    label: "Message",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      "url",
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
      ...LOCATION_PLACEHOLDERS,
      "budget",
      "budget_line",
      "guest_count",
    ],
  },
  {
    id: "signal.wishlist_added.body",
    item: "signal.wishlist_added",
    label: "Message",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS, "url"],
  },
  {
    id: "signal.wishlist_removed.body",
    item: "signal.wishlist_removed",
    label: "Message",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS, "url"],
  },
  {
    id: "signal.wishlist_changed.body",
    item: "signal.wishlist_changed",
    label: "Message",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS, "url"],
  },
  {
    id: "push.opened.title",
    item: "push.opened",
    label: "Opened title",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS, ...DATE_PLACEHOLDERS],
  },
  {
    id: "push.opened.body",
    item: "push.opened",
    label: "Opened body",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "push.revealed.title",
    item: "push.revealed",
    label: "Unwrapped title",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS, ...DATE_PLACEHOLDERS],
  },
  {
    id: "push.revealed.body",
    item: "push.revealed",
    label: "Unwrapped body",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "push.wishlist_added.title",
    item: "push.wishlist_added",
    label: "Wishlist added title",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS, ...DATE_PLACEHOLDERS],
  },
  {
    id: "push.wishlist_added.body",
    item: "push.wishlist_added",
    label: "Wishlist added body",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "push.wishlist_read.title",
    item: "push.wishlist_read",
    label: "Wishlist viewed title",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS, ...DATE_PLACEHOLDERS],
  },
  {
    id: "push.wishlist_read.body",
    item: "push.wishlist_read",
    label: "Wishlist viewed body",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "reveal.greeting",
    item: "reveal.greeting",
    label: "Greeting",
    kind: "input",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "reveal.ready_description",
    item: "reveal.unwrap",
    label: "Unwrap description",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "reveal.unwrap_button",
    item: "reveal.unwrap_button",
    label: "Unwrap button",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.unwrapping",
    item: "reveal.unwrap_button",
    label: "Unwrap in progress",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.revealed_title",
    item: "reveal.revealed_title",
    label: "Revealed title",
    kind: "input",
    placeholders: [...RECEIVER_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.revealed_name",
    item: "reveal.revealed_title",
    label: "Revealed name",
    kind: "input",
    placeholders: [...RECEIVER_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.budget",
    item: "reveal.budget",
    label: "Budget line",
    kind: "input",
    placeholders: ["budget"],
  },
  {
    id: "reveal.budget_zero",
    item: "reveal.budget",
    label: "Make-the-gift line",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.budget_unlimited",
    item: "reveal.budget",
    label: "No-limit line",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.wishlist_heading",
    item: "reveal.wishlist",
    label: "Their wishlist heading",
    kind: "input",
    placeholders: [...RECEIVER_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.wishlist_empty",
    item: "reveal.wishlist",
    label: "Their wishlist empty",
    kind: "input",
    placeholders: [...RECEIVER_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.own_wishlist_title",
    item: "reveal.own_wishlist",
    label: "Own wishlist title",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.own_wishlist_description",
    item: "reveal.own_wishlist",
    label: "Own wishlist description",
    kind: "textarea",
    placeholders: [...GIVER_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.not_found_title",
    item: "reveal.not_found",
    label: "Invalid link title",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.not_found_description",
    item: "reveal.not_found",
    label: "Invalid link description",
    kind: "textarea",
    placeholders: [],
  },
  {
    id: "reveal.unwrap_error",
    item: "reveal.unwrap_error",
    label: "Unwrap error",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.previous_title",
    item: "reveal.previous_years",
    label: "Previous years title",
    kind: "input",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "reveal.previous_description",
    item: "reveal.previous_years",
    label: "Previous years description",
    kind: "textarea",
    placeholders: [
      ...GIVER_NAME_PLACEHOLDERS,
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
    ],
  },
  {
    id: "reveal.previous_row",
    item: "reveal.previous_years",
    label: "Previous years row",
    kind: "input",
    placeholders: ["year", ...RECEIVER_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.photos_button",
    item: "reveal.photos",
    label: "Photos button",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.photos_current",
    item: "reveal.photos",
    label: "This edition photos",
    kind: "input",
    placeholders: [...EVENT_NAME_PLACEHOLDERS],
  },
  {
    id: "reveal.gallery_title",
    item: "reveal.photos",
    label: "Gallery title",
    kind: "input",
    placeholders: [
      ...EVENT_NAME_PLACEHOLDERS,
      ...DATE_PLACEHOLDERS,
      "year",
    ],
  },
  {
    id: "reveal.gallery_back",
    item: "reveal.photos",
    label: "Gallery back",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.gallery_download",
    item: "reveal.photos",
    label: "Gallery download",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.gallery_close",
    item: "reveal.photos",
    label: "Gallery close",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.gallery_previous",
    item: "reveal.photos",
    label: "Gallery previous",
    kind: "input",
    placeholders: [],
  },
  {
    id: "reveal.gallery_next",
    item: "reveal.photos",
    label: "Gallery next",
    kind: "input",
    placeholders: [],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  item: TemplateItemId;
  label: string;
  kind: "input" | "textarea";
  placeholders: readonly string[];
}>;

export type TemplateId = (typeof TEMPLATE_FIELDS)[number]["id"];

export const TEMPLATE_IDS: TemplateId[] = TEMPLATE_FIELDS.map((f) => f.id);

const WISHLIST_NOTICE_PREFIXES = [
  "email.wishlist_",
  "signal.wishlist_",
] as const;

/** Email and Signal copy sent to the giver when their match edits the list. */
export function isWishlistNoticeTemplateId(id: string): boolean {
  return WISHLIST_NOTICE_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function templateFieldById(id: TemplateId) {
  return TEMPLATE_FIELDS.find((field) => field.id === id);
}

/** Placeholders this field may use. Wishlist-notice fields reject the rest. */
export function allowedPlaceholdersFor(
  id: TemplateId,
): readonly string[] | null {
  if (!isWishlistNoticeTemplateId(id)) return null;
  return templateFieldById(id)?.placeholders ?? [];
}

export type TemplatesView = Record<
  TemplateLanguage,
  Record<TemplateId, string>
>;

export type TemplatesPatch = Partial<
  Record<TemplateLanguage, Partial<Record<TemplateId, string>>>
>;

export const TEMPLATE_PLACEHOLDERS = [
  ...GIVER_NAME_PLACEHOLDERS,
  ...RECEIVER_NAME_PLACEHOLDERS,
  ...EVENT_NAME_PLACEHOLDERS,
  ...DATE_PLACEHOLDERS,
  ...LOCATION_PLACEHOLDERS,
  "url",
  "button",
  "budget",
  "budget_line",
  "guest_count",
  "year",
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

export type TemplateVars = Partial<Record<TemplatePlaceholder, string>>;

export const GENDER_SELECT_PLACEHOLDERS = [
  "giver_gender",
  "receiver_gender",
] as const;

export const COUNT_SELECT_PLACEHOLDERS = ["guest_count"] as const;

const NAME_CASE_HINTS: Record<string, string> = {
  mianownik: "nominative",
  dopelniacz: "genitive (kogo nie ma?)",
  celownik: "dative (komu się przyglądam?)",
  biernik: "accusative (kogo widzę?)",
  narzednik: "instrumental (z kim idę?)",
  miejscownik: "locative (o kim mówię?)",
  wolacz: "vocative (hej, …!)",
};

function namePlaceholderLabel(
  prefix: "giver" | "receiver" | "event",
  key: string,
): string {
  const who =
    prefix === "giver" ? "Guest" : prefix === "receiver" ? "Match" : "Event";
  if (key === "") return `${who} name`;
  if (key === "gender") {
    return `${who} gender (${GENDER_CODES.join(" or ")})`;
  }
  const hint = NAME_CASE_HINTS[key];
  return hint ? `${who} name, ${hint}` : `${who} ${key}`;
}

function isDatePlaceholder(name: string): name is DatePlaceholder {
  return (DATE_PLACEHOLDERS as readonly string[]).includes(name);
}

function isLocationPlaceholder(name: string): name is LocationPlaceholder {
  return (LOCATION_PLACEHOLDERS as readonly string[]).includes(name);
}

/** Human label for a `{placeholder}` name, including unknown keys. */
export function templatePlaceholderLabel(name: string): string {
  if (isDatePlaceholder(name)) return DATE_PLACEHOLDER_LABELS[name];
  if (isLocationPlaceholder(name)) return LOCATION_PLACEHOLDER_LABELS[name];
  if (name === "url") return "Private guest link";
  if (name === "button") {
    return "Large link button (uses Button label + guest URL)";
  }
  if (name === "budget") return "Budget amount (e.g. €20)";
  if (name === "budget_line") return "Rendered budget sentence";
  if (name === "guest_count") return "People in the lottery";
  if (name === "year") return "Past edition year";
  if (name === "event" || name.startsWith("event_")) {
    const rest = name === "event" ? "" : name.slice("event_".length);
    return namePlaceholderLabel("event", rest);
  }
  if (name.startsWith("giver")) {
    const rest = name === "giver" ? "" : name.slice("giver_".length);
    return namePlaceholderLabel("giver", rest);
  }
  if (name.startsWith("receiver")) {
    const rest = name === "receiver" ? "" : name.slice("receiver_".length);
    return namePlaceholderLabel("receiver", rest);
  }
  return name;
}

export const TEMPLATE_PLACEHOLDER_LABELS: Record<TemplatePlaceholder, string> =
  Object.fromEntries(
    TEMPLATE_PLACEHOLDERS.map((name) => [name, templatePlaceholderLabel(name)]),
  ) as Record<TemplatePlaceholder, string>;

/**
 * Bundled reference copy. Keep a warm, friendly tone that is easy to
 * understand, and follow official grammar, spelling, and letter punctuation
 * for each language wherever possible (vocative commas in English, Polish,
 * and Spanish greetings, and German `Hallo {giver}!` without a comma;
 * English targets the British variant — British spelling and grammar,
 * spaced en-dashes, `PS` without periods; Polish and German lowercase after
 * a comma salutation; Spanish colon after the greeting and `P. D.:` with a
 * colon; Polish `PS` without periods). Guests are addressed by first name,
 * so informal greetings like Polish `Cześć` are intentional. `{location}`
 * is typically a city or town name, so `in {location}` / `en {location}` /
 * `{location}に` in non-Polish templates is intentional. Tentative phrasing
 * about gathering in `{location}` (including Japanese `過ごせそうだよ`) and
 * sending presents by post are intentional. Polish `dla jednej wylosowanej
 * osoby` (`jednej`) intentionally stresses preparing a single present, and
 * delivered emails are assumed to render HTML buttons properly. Casual,
 * friendly Japanese is intentional, and the instructions stay simple.
 * Local rationale for these choices, when present, is gitignored
 * `PRIVATE_CONTEXT.md`. Do not commit that file or copy its details here.
 */
export const TEMPLATE_DEFAULTS: TemplatesView = {
  en: enDefaults as Record<TemplateId, string>,
  pl: plDefaults as Record<TemplateId, string>,
  de: deDefaults as Record<TemplateId, string>,
  es: esDefaults as Record<TemplateId, string>,
  ja: jaDefaults as Record<TemplateId, string>,
};

export function isTemplateLanguage(
  value: string,
): value is TemplateLanguage {
  return (TEMPLATE_LANGUAGES as readonly string[]).includes(value);
}

/** Guest language if we have templates for it, else English. */
export function resolveTemplateLanguage(
  guestLang: string | null | undefined,
): TemplateLanguage {
  if (guestLang && isTemplateLanguage(guestLang)) return guestLang;
  return "en";
}

export type InvitationTemplateChannel = "email" | "signal";

const INVITATION_TEMPLATE_FIELDS = {
  email: ["email.subject", "email.body", "email.button"],
  signal: ["signal.body"],
} as const satisfies Record<InvitationTemplateChannel, readonly TemplateId[]>;

function invitationChannelNoun(channel: InvitationTemplateChannel): string {
  return channel === "email" ? "email" : "Signal";
}

function blankInvitationFields(
  templates: TemplatesView,
  language: TemplateLanguage,
  channel: InvitationTemplateChannel,
): string[] {
  return INVITATION_TEMPLATE_FIELDS[channel]
    .filter((id) => templates[language][id].trim() === "")
    .map(
      (id) => TEMPLATE_FIELDS.find((field) => field.id === id)!.label,
    );
}

/**
 * Why email or Signal cannot be sent for these guests. Unknown languages
 * and blank required fields are both missing templates. Guests who will
 * not receive the channel should be omitted by the caller.
 */
export function missingInvitationTemplateReason(
  channel: InvitationTemplateChannel,
  guests: ReadonlyArray<{ name: string; language: string }>,
  templates: TemplatesView,
): string | null {
  if (guests.length === 0) return null;
  const noun = invitationChannelNoun(channel);
  const unknown = guests
    .filter((guest) => !isTemplateLanguage(guest.language))
    .sort(
      (a, b) =>
        compareNames(a.name, b.name) ||
        a.language.localeCompare(b.language),
    );
  const missingByLanguage: Array<{ language: TemplateLanguage; labels: string[] }> =
    [];
  for (const language of TEMPLATE_LANGUAGES) {
    if (!guests.some((guest) => guest.language === language)) continue;
    const labels = blankInvitationFields(templates, language, channel);
    if (labels.length > 0) missingByLanguage.push({ language, labels });
  }
  const parts: string[] = [];
  if (unknown.length > 0) {
    const listed = unknown
      .map((guest) => {
        const code = guest.language.trim();
        return `${guest.name} (${code || "unknown"})`;
      })
      .join(", ");
    parts.push(
      `Cannot send ${noun} invitations because the following guests have no ${noun} templates in their language: ${listed}.`,
    );
  }
  if (missingByLanguage.length > 0) {
    const listed = missingByLanguage.map(
      (item) =>
        `the ${languageLabel(item.language)} ${noun} template is missing ${item.labels.join(", ")}`,
    );
    const sentence =
      listed.length === 1
        ? listed[0]
        : `${listed.slice(0, -1).join(", ")}, and ${listed[listed.length - 1]}`;
    parts.push(`Cannot send ${noun} invitations because ${sentence}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export function budgetSentenceIds(kind: BudgetKind): {
  email: TemplateId;
  reveal: TemplateId;
} {
  if (kind === "zero") {
    return { email: "email.budget_zero", reveal: "reveal.budget_zero" };
  }
  if (kind === "unlimited") {
    return {
      email: "email.budget_unlimited",
      reveal: "reveal.budget_unlimited",
    };
  }
  return { email: "email.budget_line", reveal: "reveal.budget" };
}

/** Blank amount, make-the-gift, or no-limit copy for a guest's language. */
export function missingBudgetSentenceReason(
  kind: BudgetKind,
  guests: ReadonlyArray<{ name: string; language: string }>,
  templates: TemplatesView,
): string | null {
  if (guests.length === 0) return null;
  const ids = budgetSentenceIds(kind);
  const emailLabel = TEMPLATE_FIELDS.find((field) => field.id === ids.email)!.label;
  const revealLabel = TEMPLATE_FIELDS.find((field) => field.id === ids.reveal)!.label;
  const missingByLanguage: Array<{ language: TemplateLanguage; labels: string[] }> =
    [];
  for (const language of TEMPLATE_LANGUAGES) {
    if (!guests.some((guest) => guest.language === language)) continue;
    const labels: string[] = [];
    if (templates[language][ids.email].trim() === "") {
      labels.push(`email ${emailLabel}`);
    }
    if (templates[language][ids.reveal].trim() === "") {
      labels.push(`reveal page ${revealLabel}`);
    }
    if (labels.length > 0) missingByLanguage.push({ language, labels });
  }
  if (missingByLanguage.length === 0) return null;
  const listed = missingByLanguage.map(
    (item) =>
      `the ${languageLabel(item.language)} budget text is missing ${item.labels.join(" and ")}`,
  );
  const sentence =
    listed.length === 1
      ? listed[0]
      : `${listed.slice(0, -1).join(", ")}, and ${listed[listed.length - 1]}`;
  return `Cannot send invitations because ${sentence}.`;
}

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value);
}

export function cloneTemplatesView(source: TemplatesView): TemplatesView {
  const view = {} as TemplatesView;
  for (const lang of TEMPLATE_LANGUAGES) {
    view[lang] = { ...source[lang] };
  }
  return view;
}

export function emptyTemplatesView(): TemplatesView {
  return cloneTemplatesView(TEMPLATE_DEFAULTS);
}

/** Fill any ids missing from a cached or older view with current defaults. */
export function templatesViewWithDefaults(
  stored: TemplatesView,
): TemplatesView {
  const view = emptyTemplatesView();
  for (const lang of TEMPLATE_LANGUAGES) {
    view[lang] = { ...view[lang], ...stored[lang] };
  }
  return view;
}

export function applyTemplatesPatch(
  view: TemplatesView,
  patch: TemplatesPatch,
): TemplatesView {
  const next = cloneTemplatesView(view);
  for (const lang of TEMPLATE_LANGUAGES) {
    const fields = patch[lang];
    if (!fields) continue;
    for (const id of TEMPLATE_IDS) {
      if (!Object.prototype.hasOwnProperty.call(fields, id)) continue;
      next[lang][id] = fields[id] ?? "";
    }
  }
  return next;
}

export function templatesViewFromRows(
  rows: ReadonlyArray<{ templateId: string; language: string; value: string }>,
  defaults: TemplatesView = emptyTemplatesView(),
): TemplatesView {
  const view = cloneTemplatesView(defaults);
  for (const row of rows) {
    if (!isTemplateLanguage(row.language) || !isTemplateId(row.templateId)) {
      continue;
    }
    view[row.language][row.templateId] = row.value;
  }
  return view;
}
