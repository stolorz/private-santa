import { describe, expect, it } from "vitest";
import { isRevealed, revealPageSurfaces } from "@/lib/reveal";
import { makeAssignment } from "@/test/helpers/fixtures";

describe("isRevealed", () => {
  it("is false until the guest has unwrapped this token", () => {
    expect(isRevealed(makeAssignment({ revealCount: 0 }))).toBe(false);
    expect(isRevealed(makeAssignment({ revealCount: 1 }))).toBe(true);
    expect(isRevealed(makeAssignment({ revealCount: 4 }))).toBe(true);
  });
});

describe("revealPageSurfaces", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");

  it("keeps the wishlist open and hides this year's photos until the date is past", () => {
    expect(revealPageSurfaces(null, 4, now)).toEqual({
      showOwnWishlist: true,
      currentPhotoCount: 0,
    });
    expect(revealPageSurfaces(undefined, 4, now)).toEqual({
      showOwnWishlist: true,
      currentPhotoCount: 0,
    });
    expect(revealPageSurfaces("", 3, now)).toEqual({
      showOwnWishlist: true,
      currentPhotoCount: 0,
    });
    expect(revealPageSurfaces("not-a-date", 3, now)).toEqual({
      showOwnWishlist: true,
      currentPhotoCount: 0,
    });
    expect(revealPageSurfaces("2026-11-06", 2, now)).toEqual({
      showOwnWishlist: true,
      currentPhotoCount: 0,
    });
    expect(revealPageSurfaces("2099-12-24", 2, now)).toEqual({
      showOwnWishlist: true,
      currentPhotoCount: 0,
    });
  });

  it("ignores a dummy ready count while the wishlist is still open", () => {
    expect(revealPageSurfaces("2099-12-24", 99, now).currentPhotoCount).toBe(0);
    expect(revealPageSurfaces("2099-12-24", 99, now).showOwnWishlist).toBe(
      true,
    );
  });

  it("closes the wishlist and surfaces ready photos from the next UTC day", () => {
    expect(revealPageSurfaces("2026-11-05", 4, now)).toEqual({
      showOwnWishlist: false,
      currentPhotoCount: 4,
    });
    expect(revealPageSurfaces("2000-01-01", 0, now)).toEqual({
      showOwnWishlist: false,
      currentPhotoCount: 0,
    });
    expect(revealPageSurfaces("2000-01-01").currentPhotoCount).toBe(0);
    expect(revealPageSurfaces("2000-01-01", 1).showOwnWishlist).toBe(false);
  });
});
