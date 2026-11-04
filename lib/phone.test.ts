import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIAL_CODE,
  digitsOnly,
  formatPhone,
  splitPhone,
  toE164,
} from "./phone";

describe("digitsOnly", () => {
  it("strips everything that is not a digit", () => {
    expect(digitsOnly("+351 912 345 678")).toBe("351912345678");
    expect(digitsOnly("")).toBe("");
  });
});

describe("toE164", () => {
  it("prefixes stored digits with +", () => {
    expect(toE164("351912345678")).toBe("+351912345678");
  });

  it("returns the original string when there are no digits", () => {
    expect(toE164("+")).toBe("+");
    expect(toE164("abc")).toBe("abc");
  });
});

describe("splitPhone", () => {
  it("defaults to Portugal when empty", () => {
    expect(splitPhone(null)).toEqual({ code: DEFAULT_DIAL_CODE, number: "" });
    expect(splitPhone("")).toEqual({ code: DEFAULT_DIAL_CODE, number: "" });
  });

  it("splits a stored Portuguese number", () => {
    expect(splitPhone("351912345678")).toEqual({
      code: "351",
      number: "912345678",
    });
  });

  it("picks the longest matching dial code", () => {
    // 351 vs a hypothetical shorter prefix — Portugal must win over "1"/"3".
    expect(splitPhone("351912345678").code).toBe("351");
    expect(splitPhone("19125551212")).toEqual({
      code: "1",
      number: "9125551212",
    });
  });

  it("falls back to the default code when nothing matches", () => {
    expect(splitPhone("999123")).toEqual({
      code: DEFAULT_DIAL_CODE,
      number: "999123",
    });
  });

  it("accepts formatted input by stripping non-digits first", () => {
    expect(splitPhone("+351 912 345 678")).toEqual({
      code: "351",
      number: "912345678",
    });
  });
});

describe("formatPhone", () => {
  it("returns empty string for missing input", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("")).toBe("");
  });

  it("renders +dial and groups the local number in threes", () => {
    expect(formatPhone("351912345678")).toBe("+351 912 345 678");
  });

  it("leaves remainder digits in the last group", () => {
    expect(formatPhone("35191234567")).toBe("+351 912 345 67");
    expect(formatPhone("3519123456")).toBe("+351 912 345 6");
  });
});

describe("splitPhone round-trip", () => {
  it("recovers the stored digits from code + local number", () => {
    const stored = "351912345678";
    const { code, number } = splitPhone(stored);
    expect(`${code}${number}`).toBe(stored);
  });
});

