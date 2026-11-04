import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { allocateUniqueRevealToken } from "@/lib/event-code";
import { isReservedFirstSegment, REVEAL_TOKEN_RE } from "@/lib/ids";

function isKeptRevealToken(token: string): boolean {
  return REVEAL_TOKEN_RE.test(token) && !isReservedFirstSegment(token);
}

/**
 * Replace stored reveal tokens that are not a safe 6-character id.
 * Existing pairs, reveal counts, and wishlist state stay on the row.
 * A second call is a no-op. Returns how many tokens were replaced.
 */
export function shortenRevealTokens(): number {
  return db.transaction((tx) => {
    const rows = tx.select().from(schema.assignment).all();
    const used = new Set(rows.map((row) => row.revealToken));
    let replaced = 0;
    for (const row of rows) {
      if (isKeptRevealToken(row.revealToken)) continue;
      used.delete(row.revealToken);
      const next = allocateUniqueRevealToken(used);
      tx.update(schema.assignment)
        .set({ revealToken: next })
        .where(eq(schema.assignment.id, row.id))
        .run();
      replaced += 1;
    }
    return replaced;
  });
}
