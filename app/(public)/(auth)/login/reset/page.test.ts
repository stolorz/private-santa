import { describe, expect, it } from "vitest";
import { firstQuery } from "./page";

describe("firstQuery", () => {
  it("trims a string", () => {
    expect(firstQuery("  abc  ")).toBe("abc");
  });

  it("uses the first entry of a repeated query", () => {
    expect(firstQuery(["  tok  ", "other"])).toBe("tok");
  });

  it("turns a blank into an empty string", () => {
    expect(firstQuery("   ")).toBe("");
    expect(firstQuery("")).toBe("");
  });

  it("turns a missing value into an empty string", () => {
    expect(firstQuery(undefined)).toBe("");
  });
});
