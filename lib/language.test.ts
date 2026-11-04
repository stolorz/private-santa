import { describe, expect, it } from "vitest";
import { isLanguage, languageLabel } from "./language";

describe("isLanguage", () => {
  it("accepts the stored guest codes", () => {
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("pl")).toBe(true);
    expect(isLanguage("ja")).toBe(true);
    expect(isLanguage("pt")).toBe(false);
    expect(isLanguage("zz")).toBe(false);
  });
});

describe("languageLabel", () => {
  it("returns the display name or the raw code", () => {
    expect(languageLabel("pl")).toBe("Polish");
    expect(languageLabel("zz")).toBe("zz");
  });
});
