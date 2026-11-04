import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, first, schema } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guestById } from "@/lib/people";
import { notifyAdminsOfGuestActivity } from "@/lib/push";
import { asNameCases } from "@/lib/name-cases";
import {
  notifyGiverOfWishlistChange,
  type WishlistChangeKind,
} from "@/lib/wishlist-notify";

export const wishlistTextSchema = z.object({
  text: z.string().min(1),
});

export async function listWishlistItems(guestId: number) {
  return db
    .select()
    .from(schema.wishlistItem)
    .where(eq(schema.wishlistItem.guestId, guestId));
}

export async function addWishlistItem(guestId: number, text: string) {
  const row = await first(
    db
      .insert(schema.wishlistItem)
      .values({ guestId, text })
      .returning(),
  );
  await recordWishlistChange(guestId, { kind: "added" });
  return row;
}

export async function updateOwnedWishlistItem(
  guestId: number,
  id: number,
  text: string,
) {
  const owned = await first(
    db
      .select()
      .from(schema.wishlistItem)
      .where(
        and(
          eq(schema.wishlistItem.id, id),
          eq(schema.wishlistItem.guestId, guestId),
        ),
      ),
  );
  if (!owned) {
    throw new DomainError("This wish was not found.", 404);
  }
  if (owned.text === text) return owned;
  const row = await first(
    db
      .update(schema.wishlistItem)
      .set({ text })
      .where(eq(schema.wishlistItem.id, id))
      .returning(),
  );
  await recordWishlistChange(guestId, { kind: "changed" });
  return row ?? owned;
}

export async function deleteOwnedWishlistItem(guestId: number, id: number) {
  const owned = await first(
    db
      .select()
      .from(schema.wishlistItem)
      .where(
        and(
          eq(schema.wishlistItem.id, id),
          eq(schema.wishlistItem.guestId, guestId),
        ),
      ),
  );
  if (!owned) return;
  await db.delete(schema.wishlistItem).where(eq(schema.wishlistItem.id, id));
  await recordWishlistChange(guestId, { kind: "removed" });
}

export async function wishlistItemCounts(
  guestIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (guestIds.length === 0) return counts;
  const rows = await db
    .select({
      guestId: schema.wishlistItem.guestId,
      c: count(),
    })
    .from(schema.wishlistItem)
    .where(inArray(schema.wishlistItem.guestId, guestIds))
    .groupBy(schema.wishlistItem.guestId);
  for (const row of rows) {
    counts.set(row.guestId, Number(row.c));
  }
  return counts;
}

/**
 * Mark the guest's own list as changed. Tell admins an item was added —
 * never include the item text. Tell the santa once until they look.
 */
export async function recordWishlistChange(
  guestId: number,
  opts: { kind: WishlistChangeKind },
): Promise<void> {
  await db
    .update(schema.guest)
    .set({ wishlistUpdatedAt: new Date() })
    .where(eq(schema.guest.id, guestId));

  if (opts.kind === "added") {
    const guest = await guestById(guestId);
    if (guest) {
      void notifyAdminsOfGuestActivity({
        kind: "wishlist_added",
        giver: asNameCases(guest),
        eventId: guest.eventId,
      });
    }
  }

  await notifyGiverOfWishlistChange(guestId, opts.kind);
}
