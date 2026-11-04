import { describe, expect, it } from "vitest";
import { COUNT_BRANCH_KEYS, countBranchKey } from "./count";

describe("countBranchKey", () => {
  it("uses Gettext Polish numeral agreement", () => {
    const pl: Record<number, "1" | "2" | null> = {
      0: null,
      1: "1",
      2: "2",
      4: "2",
      5: null,
      11: null,
      12: null,
      13: null,
      14: null,
      21: null,
      22: "2",
      24: "2",
      25: null,
      102: "2",
      112: null,
    };
    for (const [n, key] of Object.entries(pl)) {
      expect(countBranchKey("pl", Number(n))).toBe(key);
    }
  });

  it("treats non-Polish languages as singular vs rest", () => {
    for (const lang of ["en", "de", "es", "ja", "fr"] as const) {
      expect(countBranchKey(lang, 1)).toBe("1");
      expect(countBranchKey(lang, 0)).toBeNull();
      expect(countBranchKey(lang, 2)).toBeNull();
      expect(countBranchKey(lang, 22)).toBeNull();
    }
  });

  it("exposes 1 and 2 as the only keyed branches", () => {
    expect(COUNT_BRANCH_KEYS).toEqual(["1", "2"]);
  });
});
