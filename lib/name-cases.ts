import { genderVars, isGender, type Gender } from "@/lib/gender";

/** Polish grammatical cases for a person or event name (odmiana przez przypadki). */

export const OPTIONAL_NAME_CASE_FIELDS = [
  {
    key: "dopelniacz",
    field: "nameDopelniacz",
    label: "Dopełniacz",
    hint: "kogo nie ma?",
  },
  {
    key: "celownik",
    field: "nameCelownik",
    label: "Celownik",
    hint: "komu się przyglądam?",
  },
  {
    key: "biernik",
    field: "nameBiernik",
    label: "Biernik",
    hint: "kogo widzę?",
  },
  {
    key: "narzednik",
    field: "nameNarzednik",
    label: "Narzędnik",
    hint: "z kim idę?",
  },
  {
    key: "miejscownik",
    field: "nameMiejscownik",
    label: "Miejscownik",
    hint: "o kim mówię?",
  },
  {
    key: "wolacz",
    field: "nameWolacz",
    label: "Wołacz",
    hint: "hej, …!",
  },
] as const;

export type NameCaseKey =
  | "mianownik"
  | (typeof OPTIONAL_NAME_CASE_FIELDS)[number]["key"];

export type OptionalNameCaseField =
  (typeof OPTIONAL_NAME_CASE_FIELDS)[number]["field"];

const OPTIONAL_FIELD_BY_KEY = Object.fromEntries(
  OPTIONAL_NAME_CASE_FIELDS.map((spec) => [spec.key, spec.field]),
) as Record<Exclude<NameCaseKey, "mianownik">, OptionalNameCaseField>;

export function optionalNameCaseZodFields<T>(
  schema: T,
): Record<OptionalNameCaseField, T> {
  return Object.fromEntries(
    OPTIONAL_NAME_CASE_FIELDS.map(({ field }) => [field, schema]),
  ) as Record<OptionalNameCaseField, T>;
}

export type NameCases = {
  name: string;
  gender?: Gender | null;
} & Record<OptionalNameCaseField, string | null>;

function prefixedPlaceholders<P extends string>(
  prefix: P,
  extra: readonly string[] = [],
): readonly string[] {
  return [
    prefix,
    `${prefix}_mianownik`,
    ...OPTIONAL_NAME_CASE_FIELDS.map((spec) => `${prefix}_${spec.key}`),
    ...extra,
  ];
}

export const GIVER_NAME_PLACEHOLDERS = prefixedPlaceholders("giver", [
  "giver_gender",
]);

export const RECEIVER_NAME_PLACEHOLDERS = prefixedPlaceholders("receiver", [
  "receiver_gender",
]);

export const EVENT_NAME_PLACEHOLDERS = prefixedPlaceholders("event");

export type NameCaseFormValues = Record<OptionalNameCaseField, string>;

export function normalizeNameCase(
  value: string | null | undefined,
): string | null {
  const s = value?.trim() ?? "";
  return s || null;
}

/** Labels of the six Polish cases that are blank after trim. */
export function missingNameCases(
  source:
    | Partial<Record<OptionalNameCaseField, string | null | undefined>>
    | null
    | undefined,
): string[] {
  return OPTIONAL_NAME_CASE_FIELDS.filter(
    (spec) => !normalizeNameCase(source?.[spec.field]),
  ).map((spec) => spec.label);
}

/** Sentence for a person save that is missing one or more Polish cases. */
export function missingPolishCasesMessage(
  source: Parameters<typeof missingNameCases>[0],
): string | null {
  const missing = missingNameCases(source);
  if (missing.length === 0) return null;
  return `Enter the missing Polish cases: ${missing.join(", ")}.`;
}

/**
 * Stored case when set, otherwise the incoming value. Used to decide whether
 * a person write would still be missing a case.
 */
export function resolvedNameCases(
  existing:
    | Partial<Record<OptionalNameCaseField, string | null | undefined>>
    | null
    | undefined,
  incoming: Partial<Record<OptionalNameCaseField, string | null | undefined>>,
): Record<OptionalNameCaseField, string | null> {
  const result = {} as Record<OptionalNameCaseField, string | null>;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    result[field] =
      normalizeNameCase(existing?.[field]) || normalizeNameCase(incoming[field]);
  }
  return result;
}

export function emptyNameCaseForm(): NameCaseFormValues {
  return Object.fromEntries(
    OPTIONAL_NAME_CASE_FIELDS.map(({ field }) => [field, ""]),
  ) as NameCaseFormValues;
}

export function nameCaseFormFrom(
  person: Partial<NameCases> | null | undefined,
): NameCaseFormValues {
  const values = emptyNameCaseForm();
  if (!person) return values;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    values[field] = person[field] ?? "";
  }
  return values;
}

export function asNameCases(person: NameCases): NameCases {
  const cases = {} as Record<OptionalNameCaseField, string | null>;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    cases[field] = person[field] ?? null;
  }
  return {
    name: person.name,
    ...cases,
    gender: person.gender && isGender(person.gender) ? person.gender : null,
  };
}

export function nameCases(
  name: string,
  overrides: Partial<Omit<NameCases, "name">> = {},
): NameCases {
  const empty = {} as Record<OptionalNameCaseField, string | null>;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    empty[field] = null;
  }
  return asNameCases({
    name,
    ...empty,
    ...overrides,
  });
}

export function optionalNameCasesFromBody(
  body: Partial<Record<OptionalNameCaseField, string | null | undefined>>,
): Record<OptionalNameCaseField, string | null> {
  const result = {} as Record<OptionalNameCaseField, string | null>;
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    result[field] = normalizeNameCase(body[field]);
  }
  return result;
}

export function optionalNameCasesPatch(
  body: Partial<Record<OptionalNameCaseField, string | null | undefined>>,
): Partial<Record<OptionalNameCaseField, string | null>> {
  const patch: Partial<Record<OptionalNameCaseField, string | null>> = {};
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    if (body[field] === undefined) continue;
    patch[field] = normalizeNameCase(body[field]);
  }
  return patch;
}

export function fillEmptyNameCases(
  existing: NameCases,
  incoming: Partial<Record<OptionalNameCaseField, string | null>>,
): Partial<Record<OptionalNameCaseField, string | null>> {
  const fill: Partial<Record<OptionalNameCaseField, string | null>> = {};
  for (const { field } of OPTIONAL_NAME_CASE_FIELDS) {
    const next = incoming[field];
    if (!existing[field] && next) fill[field] = next;
  }
  return fill;
}

export function declinedName(person: NameCases, key: NameCaseKey): string {
  if (key === "mianownik") return person.name;
  return person[OPTIONAL_FIELD_BY_KEY[key]] || person.name;
}

export function nameVars(
  prefix: "giver" | "receiver" | "event",
  person: NameCases,
): Record<string, string> {
  const vars: Record<string, string> = {
    [prefix]: person.name,
    [`${prefix}_mianownik`]: person.name,
  };
  if (prefix !== "event") {
    Object.assign(vars, genderVars(prefix, person.gender));
  }
  for (const spec of OPTIONAL_NAME_CASE_FIELDS) {
    vars[`${prefix}_${spec.key}`] = declinedName(person, spec.key);
  }
  return vars;
}
