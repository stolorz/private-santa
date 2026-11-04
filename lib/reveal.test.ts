import { describe, expect, it } from "vitest";
import { isRevealed } from "@/lib/reveal";
import { makeAssignment } from "@/test/helpers/fixtures";

describe("isRevealed", () => {
  it("is false until the guest has unwrapped this token", () => {
    expect(isRevealed(makeAssignment({ revealCount: 0 }))).toBe(false);
    expect(isRevealed(makeAssignment({ revealCount: 1 }))).toBe(true);
    expect(isRevealed(makeAssignment({ revealCount: 4 }))).toBe(true);
  });
});
