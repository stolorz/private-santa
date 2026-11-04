import { resolveTemplateLanguage } from "./fields";

export const COUNT_BRANCH_KEYS = ["1", "2"] as const;

export type CountBranchKey = (typeof COUNT_BRANCH_KEYS)[number];

export const COUNT_BRANCH_LABELS: Record<CountBranchKey, string> = {
  "1": "Like 1",
  "2": "Like 2",
};

export function isCountBranchKey(value: string): value is CountBranchKey {
  return value === "1" || value === "2";
}

/**
 * Which keyed branch to use for `n` in this template language.
 * `null` means the unkeyed fallback. Polish uses Gettext numeral agreement
 * (`21` is fallback, not `"1"`). Other languages are singular vs rest.
 */
export function countBranchKey(
  language: string,
  n: number,
): CountBranchKey | null {
  if (resolveTemplateLanguage(language) === "pl") {
    if (n === 1) return "1";
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "2";
    return null;
  }
  return n === 1 ? "1" : null;
}
