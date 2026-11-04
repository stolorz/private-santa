import { describe, expect, it } from "vitest";
import { cn, mustExist, qty } from "@/lib/utils";

describe("qty", () => {
  it("picks the singular or plural word", () => {
    expect(qty(1, "guest", "guests")).toBe("1 guest");
    expect(qty(2, "guest", "guests")).toBe("2 guests");
    expect(qty(0, "guest", "guests")).toBe("0 guests");
  });
});

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("mustExist", () => {
  it("returns a present value", () => {
    expect(mustExist({ id: 1 }, "missing")).toEqual({ id: 1 });
  });

  it("throws when the value is nullish", () => {
    expect(() => mustExist(null, "Could not create row.")).toThrow(
      "Could not create row.",
    );
    expect(() => mustExist(undefined, "gone")).toThrow("gone");
  });
});
