import { describe, expect, it } from "vitest";
import {
  hasExclusionPair,
  isSameExclusionPair,
  orderedExclusionNames,
} from "@/lib/exclusions";

describe("orderedExclusionNames", () => {
  it("puts the alphabetically earlier name on the left", () => {
    expect(orderedExclusionNames("Bea", "Ada")).toEqual(["Ada", "Bea"]);
    expect(orderedExclusionNames("Ada", "Bea")).toEqual(["Ada", "Bea"]);
  });

  it("is case-insensitive and Polish-aware", () => {
    expect(orderedExclusionNames("łukasz", "Marek")).toEqual([
      "łukasz",
      "Marek",
    ]);
    expect(orderedExclusionNames("Żaneta", "Anna")).toEqual([
      "Anna",
      "Żaneta",
    ]);
  });
});

describe("isSameExclusionPair", () => {
  it("matches either order", () => {
    expect(
      isSameExclusionPair({ aId: 1, bId: 2 }, { aId: 1, bId: 2 }),
    ).toBe(true);
    expect(
      isSameExclusionPair({ aId: 1, bId: 2 }, { aId: 2, bId: 1 }),
    ).toBe(true);
  });

  it("does not match a different pair", () => {
    expect(
      isSameExclusionPair({ aId: 1, bId: 2 }, { aId: 1, bId: 3 }),
    ).toBe(false);
  });

  it("matches a self-pair", () => {
    expect(
      isSameExclusionPair({ aId: 3, bId: 3 }, { aId: 3, bId: 3 }),
    ).toBe(true);
  });
});

describe("hasExclusionPair", () => {
  const rows = [
    { aId: 1, bId: 2 },
    { aId: 3, bId: 4 },
  ];

  it("finds an existing pair in reverse order", () => {
    expect(hasExclusionPair(rows, 2, 1)).toBe(true);
  });

  it("is false for a new pair", () => {
    expect(hasExclusionPair(rows, 1, 3)).toBe(false);
  });

  it("finds an existing self-pair", () => {
    expect(hasExclusionPair([{ aId: 3, bId: 3 }], 3, 3)).toBe(true);
    expect(hasExclusionPair([{ aId: 3, bId: 3 }], 3, 4)).toBe(false);
  });
});
