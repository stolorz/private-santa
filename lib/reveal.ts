import type { Assignment } from "@/lib/db/schema";
import type { NameCases } from "@/lib/name-cases";

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
};

/** True once the guest has clicked through on this token. */
export function isRevealed(assignment: RevealAssignment): boolean {
  return assignment.revealCount > 0;
}
