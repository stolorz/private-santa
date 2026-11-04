import { PersonError } from "@/lib/errors";

export const GENDER_CODES = ["female", "male"] as const;

export const GENDER_REQUIRED_MESSAGE = "Gender is required.";

export const GENDERS = [
  { code: "female", label: "Female" },
  { code: "male", label: "Male" },
] as const;

export type Gender = (typeof GENDER_CODES)[number];

const CODES = new Set<string>(GENDER_CODES);

export function isGender(value: string): value is Gender {
  return CODES.has(value);
}

/** `female` or `male`, or a person-save error. Does not invent a value. */
export function requireGender(value: unknown): Gender {
  if (typeof value === "string" && isGender(value)) return value;
  throw new PersonError(GENDER_REQUIRED_MESSAGE);
}

/** Form copy when a draft has no gender. Null once one is chosen. */
export function missingGenderMessage(
  value: string | null | undefined,
): string | null {
  return value && isGender(value) ? null : GENDER_REQUIRED_MESSAGE;
}

export function genderLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return GENDERS.find((g) => g.code === code)?.label ?? null;
}

/** Stored code for templates; empty when unset so `{giver_gender}` blanks out. */
function genderCode(value: string | null | undefined): Gender | "" {
  return value && isGender(value) ? value : "";
}

export function genderVars(
  prefix: "giver" | "receiver",
  gender: string | null | undefined,
): Record<string, string> {
  return { [`${prefix}_gender`]: genderCode(gender) };
}
