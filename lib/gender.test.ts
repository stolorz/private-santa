import { describe, expect, it } from "vitest";
import {
  GENDER_REQUIRED_MESSAGE,
  genderLabel,
  genderVars,
  isGender,
  missingGenderMessage,
  requireGender,
} from "@/lib/gender";
import { PersonError } from "@/lib/errors";

describe("isGender", () => {
  it("accepts female and male", () => {
    expect(isGender("female")).toBe(true);
    expect(isGender("male")).toBe(true);
    expect(isGender("other")).toBe(false);
  });
});

describe("requireGender", () => {
  it("accepts female and male and rejects everything else", () => {
    expect(requireGender("female")).toBe("female");
    expect(requireGender("male")).toBe("male");
    for (const value of [null, undefined, "", "nope", 1, "Female"]) {
      expect(() => requireGender(value)).toThrow(PersonError);
      expect(() => requireGender(value)).toThrow(GENDER_REQUIRED_MESSAGE);
    }
  });
});

describe("missingGenderMessage", () => {
  it("asks for a gender until one is chosen", () => {
    expect(missingGenderMessage(null)).toBe(GENDER_REQUIRED_MESSAGE);
    expect(missingGenderMessage(undefined)).toBe(GENDER_REQUIRED_MESSAGE);
    expect(missingGenderMessage("")).toBe(GENDER_REQUIRED_MESSAGE);
    expect(missingGenderMessage("female")).toBeNull();
    expect(missingGenderMessage("male")).toBeNull();
  });
});

describe("genderLabel", () => {
  it("returns a label for known codes and null otherwise", () => {
    expect(genderLabel("female")).toBe("Female");
    expect(genderLabel("male")).toBe("Male");
    expect(genderLabel(null)).toBeNull();
    expect(genderLabel("other")).toBeNull();
  });
});

describe("genderVars", () => {
  it("uses the stored code or blanks when unset", () => {
    expect(genderVars("giver", "female")).toEqual({ giver_gender: "female" });
    expect(genderVars("giver", "other")).toEqual({ giver_gender: "" });
    expect(genderVars("receiver", null)).toEqual({ receiver_gender: "" });
  });
});
