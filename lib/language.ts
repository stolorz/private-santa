export const LANGUAGE_CODES = ["pl", "en", "de", "es", "ja"] as const;

export const LANGUAGES = [
  { code: "pl", label: "Polish", iso2: "pl" },
  { code: "en", label: "English", iso2: "gb" },
  { code: "de", label: "German", iso2: "de" },
  { code: "es", label: "Spanish", iso2: "es" },
  { code: "ja", label: "Japanese", iso2: "jp" },
] as const;

export type Language = (typeof LANGUAGE_CODES)[number];

export const DEFAULT_LANGUAGE: Language = "pl";

const CODES = new Set<string>(LANGUAGES.map((l) => l.code));

export function isLanguage(value: string): value is Language {
  return CODES.has(value);
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
