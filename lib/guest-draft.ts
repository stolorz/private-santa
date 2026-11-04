import { type Gender, isGender } from "@/lib/gender";
import { joinNames } from "@/lib/guest-contact";
import { formatOccursOn } from "@/lib/occurs-on";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import {
  OPTIONAL_NAME_CASE_FIELDS,
  type NameCaseFormValues,
  type OptionalNameCaseField,
} from "@/lib/name-cases";

export type GuestDraftSource = {
  name: string;
  phone: string | null;
  email: string | null;
  language: string;
  gender: Gender | null;
  nameDopelniacz?: string | null;
  nameCelownik?: string | null;
  nameBiernik?: string | null;
  nameNarzednik?: string | null;
  nameMiejscownik?: string | null;
  nameWolacz?: string | null;
};

export type GuestDraftSnapshot = {
  name: string;
  phone: string;
  email: string;
  language: string;
  gender: Gender | null;
  cases: NameCaseFormValues;
};

export type DirtyGuestFields = {
  name: boolean;
  language: boolean;
  phone: boolean;
  email: boolean;
  gender: boolean;
  cases: Record<OptionalNameCaseField, boolean>;
};

export function emptyGuestDraftSource(): GuestDraftSource {
  return {
    name: "",
    phone: null,
    email: null,
    language: DEFAULT_LANGUAGE,
    gender: null,
  };
}

export function dirtyGuestFields(
  draft: GuestDraftSnapshot,
  original: GuestDraftSource,
): DirtyGuestFields {
  const cases = {} as Record<OptionalNameCaseField, boolean>;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    cases[field] = draft.cases[field] !== (original[field] ?? "");
  }
  return {
    name: draft.name !== original.name,
    language: draft.language !== original.language,
    phone: draft.phone !== (original.phone ?? ""),
    email: draft.email !== (original.email ?? ""),
    gender: draft.gender !== original.gender,
    cases,
  };
}

export function guestFieldsAreDirty(dirty: DirtyGuestFields): boolean {
  return (
    dirty.name ||
    dirty.language ||
    dirty.phone ||
    dirty.email ||
    dirty.gender ||
    OPTIONAL_NAME_CASE_FIELDS.some(({ field }) => dirty.cases[field])
  );
}

export type IdentityMatch = {
  gender?: string | null;
} & Partial<Record<OptionalNameCaseField, string | null | undefined>>;

/** Gender and Polish cases every namesake shares. A blank or a clash omits that field. */
export function agreedIdentityFill(matches: readonly IdentityMatch[]): {
  gender: Gender | null;
  cases: Partial<NameCaseFormValues>;
} {
  if (matches.length === 0) return { gender: null, cases: {} };
  const gender = agreedGender(matches);
  const cases: Partial<NameCaseFormValues> = {};
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    const value = agreedText(matches.map((match) => match[field]));
    if (value) cases[field] = value;
  }
  return { gender, cases };
}

/**
 * Copy agreed gender and cases into fields that are still empty.
 * Phone, email, and language are not part of this fill.
 */
export function fillEmptyIdentity(
  draft: { gender: Gender | null; cases: NameCaseFormValues },
  matches: readonly IdentityMatch[],
): { gender: Gender | null; cases: NameCaseFormValues } {
  const agreed = agreedIdentityFill(matches);
  const cases = { ...draft.cases };
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    const next = agreed.cases[field];
    if (next && !cases[field].trim()) cases[field] = next;
  }
  return {
    gender: draft.gender ?? agreed.gender,
    cases,
  };
}

export type SameNameEdition = { name: string; occursOn: string };

/** Question shown before merging a contactless guest into a namesake. */
export function sameNameQuestion(person: {
  name: string;
  events: readonly SameNameEdition[];
}): string {
  const name = person.name.trim();
  if (person.events.length === 0) {
    return `A person named ${name} has not been in an edition yet. Is this the same person, or a new one?`;
  }
  return `A person named ${name} is already in these editions: ${editionList(person.events)}. Is this the same person, or a new one?`;
}

function agreedGender(matches: readonly IdentityMatch[]): Gender | null {
  const first = matches[0]?.gender ?? "";
  if (!isGender(first)) return null;
  for (const match of matches) {
    if (match.gender !== first) return null;
  }
  return first;
}

function agreedText(
  values: readonly (string | null | undefined)[],
): string | null {
  const trimmed = values.map((value) => value?.trim() ?? "");
  const first = trimmed[0]!;
  if (!first || trimmed.some((value) => value !== first)) return null;
  return first;
}

function editionList(events: readonly SameNameEdition[]): string {
  return joinNames(
    events.map(
      (event) => `${event.name.trim()} (${formatOccursOn(event.occursOn)})`,
    ),
  );
}
