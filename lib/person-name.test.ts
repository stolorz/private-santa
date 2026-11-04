import { describe, expect, it } from "vitest";
import { compareNames, initials, normalizeName } from "@/lib/person-name";

describe("normalizeName", () => {
  it("trims, collapses space, and lowercases", () => {
    expect(normalizeName("  Ada   Lovelace ")).toBe("ada lovelace");
  });
});

describe("initials", () => {
  it("uses the first letter of the first two words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  ada  ")).toBe("A");
    expect(initials("A B C")).toBe("AB");
    expect(initials("")).toBe("");
  });
});

describe("compareNames", () => {
  it("sorts Polish letters with base sensitivity", () => {
    const names = ["Żaneta", "ada", "Łukasz", "Bea"];
    names.sort(compareNames);
    expect(names).toEqual(["ada", "Bea", "Łukasz", "Żaneta"]);
  });
});
