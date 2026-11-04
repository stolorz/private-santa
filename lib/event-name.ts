import {
  OPTIONAL_NAME_CASE_FIELDS,
  missingNameCases,
  nameVars,
  type OptionalNameCaseField,
} from "@/lib/name-cases";

/** Display name for an edition. Names are not unique; `code` is. */
export function eventLabel(edition: { name: string }): string {
  return edition.name.trim();
}

/** Canonical name plus optional per-language nominatives and Polish cases. */
export type EventNameFields = {
  name: string;
  nameEn: string | null;
  nameDe: string | null;
  nameEs: string | null;
  nameJa: string | null;
  namePl: string | null;
} & Record<OptionalNameCaseField, string | null>;

export function emptyEventNameFields(name = ""): EventNameFields {
  return {
    name,
    nameEn: null,
    nameDe: null,
    nameEs: null,
    nameJa: null,
    namePl: null,
    nameDopelniacz: null,
    nameCelownik: null,
    nameBiernik: null,
    nameNarzednik: null,
    nameMiejscownik: null,
    nameWolacz: null,
  };
}

/** Fields copied onto a new edition; canonical `name` is still the create-form value. */
export function eventNameOverlays(
  source: EventNameFields | null | undefined,
): Omit<EventNameFields, "name"> {
  return {
    nameEn: source?.nameEn ?? null,
    nameDe: source?.nameDe ?? null,
    nameEs: source?.nameEs ?? null,
    nameJa: source?.nameJa ?? null,
    namePl: source?.namePl ?? null,
    nameDopelniacz: source?.nameDopelniacz ?? null,
    nameCelownik: source?.nameCelownik ?? null,
    nameBiernik: source?.nameBiernik ?? null,
    nameNarzednik: source?.nameNarzednik ?? null,
    nameMiejscownik: source?.nameMiejscownik ?? null,
    nameWolacz: source?.nameWolacz ?? null,
  };
}

function overlayName(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

const REQUIRED_EVENT_TRANSLATIONS = [
  { field: "namePl", label: "Polish" },
  { field: "nameDe", label: "German" },
  { field: "nameEs", label: "Spanish" },
  { field: "nameJa", label: "Japanese" },
] as const;

type EventTranslationFields = Partial<
  Pick<EventNameFields, "namePl" | "nameDe" | "nameEs" | "nameJa">
>;

/** Language labels whose `{event}` overlay is blank or whitespace. */
export function missingEventTranslations(
  fields: EventTranslationFields | null | undefined,
): string[] {
  return REQUIRED_EVENT_TRANSLATIONS.filter(
    (spec) => !overlayName(fields?.[spec.field]),
  ).map((spec) => spec.label);
}

/** Sentence for an edition save that is missing one or more translations. */
export function missingEventTranslationsMessage(
  fields: EventTranslationFields | null | undefined,
): string | null {
  const missing = missingEventTranslations(fields);
  if (missing.length === 0) return null;
  return `Enter the missing event name translations: ${missing.join(", ")}.`;
}

/** Sentence for an edition save that is missing one or more Polish cases. */
export function missingEventNameCasesMessage(
  fields: Parameters<typeof missingNameCases>[0],
): string | null {
  const missing = missingNameCases(fields);
  if (missing.length === 0) return null;
  return `Enter the missing Polish cases for the event name: ${missing.join(", ")}.`;
}

/** Sentence that blocks invitation send until every translation is filled. */
export function missingEventTranslationsSendReason(
  fields: EventTranslationFields | null | undefined,
): string | null {
  const missing = missingEventTranslations(fields);
  if (missing.length === 0) return null;
  return `Cannot send invitations because the event is missing name translations: ${missing.join(", ")}.`;
}

function polishNominative(event: EventNameFields): string {
  return overlayName(event.namePl) || event.name.trim();
}

/**
 * Nominative shown as `{event}` in a template language.
 * English, German, Spanish, Japanese, and Polish use their overlay when set;
 * otherwise the canonical `name`.
 */
export function eventNominative(
  event: EventNameFields,
  language: string,
): string {
  const overlay =
    language === "en"
      ? event.nameEn
      : language === "de"
        ? event.nameDe
        : language === "es"
          ? event.nameEs
          : language === "ja"
            ? event.nameJa
            : language === "pl"
              ? event.namePl
              : null;
  return overlayName(overlay) || event.name.trim();
}

/**
 * Template vars for `{event}` and `{event_*}` cases.
 * Cases always inflect the Polish nominative; they never fall back to English.
 */
export function eventVars(
  event: EventNameFields,
  language: string,
): Record<string, string> {
  const localized = eventNominative(event, language);
  const cases = nameVars("event", {
    name: polishNominative(event),
    nameDopelniacz: event.nameDopelniacz,
    nameCelownik: event.nameCelownik,
    nameBiernik: event.nameBiernik,
    nameNarzednik: event.nameNarzednik,
    nameMiejscownik: event.nameMiejscownik,
    nameWolacz: event.nameWolacz,
  });
  return {
    ...cases,
    event: localized,
    event_mianownik: localized,
  };
}

export function eventNameFieldsFrom(
  event: Partial<EventNameFields> | null | undefined,
  fallbackName = "",
): EventNameFields {
  const empty = emptyEventNameFields(event?.name?.trim() || fallbackName);
  if (!event) return empty;
  const cases = {} as Record<OptionalNameCaseField, string | null>;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    cases[field] = event[field] ?? null;
  }
  return {
    ...empty,
    nameEn: event.nameEn ?? null,
    nameDe: event.nameDe ?? null,
    nameEs: event.nameEs ?? null,
    nameJa: event.nameJa ?? null,
    namePl: event.namePl ?? null,
    ...cases,
  };
}
