import type { Assignment } from "@/lib/db/schema";
import type { NameCases } from "@/lib/name-cases";
import { isOccursOnPast } from "@/lib/occurs-on";

type RevealAssignment = Pick<Assignment, "revealCount">;

/** Public match shown on the guest reveal page after they unwrap it. */
export type RevealedMatch = NameCases & {
  photo: string | null;
  wishlist: Array<{ id: number; text: string }>;
};

/**
 * Someone this giver drew in an earlier edition of the same series.
 * `personId` is a list key, not shown.
 */
export type PastGift = NameCases & {
  year: string;
  personId: number;
  eventCode: string;
  photoCount: number;
};

/** True once the guest has clicked through on this token. */
export function isRevealed(assignment: RevealAssignment): boolean {
  return assignment.revealCount > 0;
}

/**
 * What the guest reveal page shows besides the match. The giver can edit
 * their wishlist until the party date is past (next UTC day). This year's
 * photos stay hidden until then, even if ready thumbnails already exist.
 * `readyPhotoCount` defaults to 0 and is ignored while the wishlist is
 * still open.
 */
export function revealPageSurfaces(
  occursOn: string | null | undefined,
  readyPhotoCount = 0,
  now = new Date(),
): { showOwnWishlist: boolean; currentPhotoCount: number } {
  const takenPlace = occursOn != null && isOccursOnPast(occursOn, now);
  return {
    showOwnWishlist: !takenPlace,
    currentPhotoCount: takenPlace ? readyPhotoCount : 0,
  };
}
