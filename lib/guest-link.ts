import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { notFound } from "@/lib/http";
import { db, first, schema } from "@/lib/db";
import type {
  Assignment,
  Draw,
  GuestView,
  GuestVisitKind,
} from "@/lib/db/schema";
import { asGuestView } from "@/lib/people";
import {
  notifyAdminsOfGuestActivity,
  type GuestActivityKind,
} from "@/lib/push";
import type { ClientDebug } from "@/lib/request-meta";
import { requestCache } from "@/lib/request-cache";
import { asNameCases } from "@/lib/name-cases";
import { listWishlistItems } from "@/lib/wishlist";
import { isRevealed, type RevealedMatch } from "@/lib/reveal";

export { isRevealed, type RevealedMatch } from "@/lib/reveal";

export type GuestLink = {
  assignment: Assignment;
  draw: Draw;
  giver: GuestView;
  receiver: GuestView;
};

const giverGuest = alias(schema.guest, "giver_guest");
const giverPerson = alias(schema.person, "giver_person");
const receiverGuest = alias(schema.guest, "receiver_guest");
const receiverPerson = alias(schema.person, "receiver_person");

async function loadGuestLinkByToken(token: string): Promise<GuestLink | null> {
  if (!token) return null;
  const row = await first(
    db
      .select({
        assignment: schema.assignment,
        draw: schema.draw,
        giverGuest,
        giverPerson,
        receiverGuest,
        receiverPerson,
      })
      .from(schema.assignment)
      .innerJoin(schema.draw, eq(schema.draw.id, schema.assignment.drawId))
      .innerJoin(giverGuest, eq(giverGuest.id, schema.assignment.giverId))
      .innerJoin(giverPerson, eq(giverPerson.id, giverGuest.personId))
      .innerJoin(
        receiverGuest,
        eq(receiverGuest.id, schema.assignment.receiverId),
      )
      .innerJoin(receiverPerson, eq(receiverPerson.id, receiverGuest.personId))
      .where(eq(schema.assignment.revealToken, token)),
  );
  if (!row) return null;
  return {
    assignment: row.assignment,
    draw: row.draw,
    giver: asGuestView(row.giverGuest, row.giverPerson),
    receiver: asGuestView(row.receiverGuest, row.receiverPerson),
  };
}

export const guestLinkByToken = requestCache(loadGuestLinkByToken);

export async function requireGuestLink(
  token: string,
): Promise<
  | { link: GuestLink; response: null }
  | { link: null; response: ReturnType<typeof notFound> }
> {
  const link = await guestLinkByToken(token);
  if (!link) {
    return { link: null, response: notFound("This link is invalid.") };
  }
  return { link, response: null };
}

/**
 * Persist the first real-browser open of this guest link. Later calls
 * are no-ops so crawler-safe pings stay idempotent.
 */
export async function markGuestLinkOpened(
  token: string,
  debug?: ClientDebug,
): Promise<GuestLink | null> {
  const link = await guestLinkByToken(token);
  if (!link) return null;
  await logGuestVisit(link.assignment.id, "opened", debug);

  const [updated] = await db
    .update(schema.assignment)
    .set({ openedAt: new Date() })
    .where(
      and(
        eq(schema.assignment.id, link.assignment.id),
        isNull(schema.assignment.openedAt),
      ),
    )
    .returning();
  if (!updated) return link;

  notifyGuestActivity(link, "opened");

  return {
    ...link,
    assignment: { ...link.assignment, openedAt: updated.openedAt },
  };
}

/**
 * Persist the first unwrap of this guest link. Later calls are no-ops
 * so the name stays visible on every subsequent visit. Unwrap also
 * counts as opened if the open ping never landed.
 */
export async function markGuestLinkRevealed(
  token: string,
  debug?: ClientDebug,
): Promise<GuestLink | null> {
  const link = await guestLinkByToken(token);
  if (!link) return null;
  await logGuestVisit(link.assignment.id, "revealed", debug);

  const openedAt = link.assignment.openedAt ?? new Date();
  const [updated] = await db
    .update(schema.assignment)
    .set({ revealCount: 1, openedAt })
    .where(
      and(
        eq(schema.assignment.id, link.assignment.id),
        eq(schema.assignment.revealCount, 0),
      ),
    )
    .returning();
  if (!updated) return link;

  const revealed: GuestLink = {
    ...link,
    assignment: {
      ...link.assignment,
      revealCount: 1,
      openedAt: updated.openedAt,
    },
  };
  notifyGuestActivity(revealed, "revealed");
  await maybeNotifyWishlistRead(revealed);

  return revealed;
}

/**
 * Record that the santa viewed their match's wishlist. Notifies if the
 * list changed since they last looked. No-op until they have unwrapped.
 */
export async function markMatchWishlistSeen(
  token: string,
): Promise<GuestLink | null> {
  const link = await guestLinkByToken(token);
  if (!link) return null;
  if (!isRevealed(link.assignment)) return link;
  await maybeNotifyWishlistRead(link);
  return link;
}

async function logGuestVisit(
  assignmentId: number,
  kind: GuestVisitKind,
  debug?: ClientDebug,
): Promise<void> {
  await db.insert(schema.guestActivity).values({
    assignmentId,
    kind,
    ip: debug?.ip ?? null,
    userAgent: debug?.userAgent ?? null,
    browser: debug?.browser ?? null,
    os: debug?.os ?? null,
  });
}

function notifyGuestActivity(link: GuestLink, kind: GuestActivityKind) {
  void notifyAdminsOfGuestActivity({
    kind,
    giver: asNameCases(link.giver),
    eventId: link.draw.eventId,
  });
}

async function maybeNotifyWishlistRead(link: GuestLink): Promise<void> {
  const updatedAt = link.receiver.wishlistUpdatedAt;
  const seenAt = link.assignment.wishlistSeenAt;
  const unread =
    updatedAt != null &&
    (seenAt == null || updatedAt.getTime() > seenAt.getTime());
  if (unread) {
    notifyGuestActivity(link, "wishlist_read");
  }
  if (!unread && seenAt != null) return;
  const now = new Date();
  await db
    .update(schema.assignment)
    .set({ wishlistSeenAt: now, wishlistNotifyClaim: null })
    .where(eq(schema.assignment.id, link.assignment.id));
  link.assignment = {
    ...link.assignment,
    wishlistSeenAt: now,
    wishlistNotifyClaim: null,
  };
}

/** Receiver name, photo and wishlist — nothing that would leak contact details. */
export async function loadRevealedMatch(
  link: GuestLink,
): Promise<RevealedMatch> {
  const items = await listWishlistItems(link.receiver.id);
  return {
    ...asNameCases(link.receiver),
    photo: link.receiver.photo,
    wishlist: items.map((w) => ({ id: w.id, text: w.text })),
  };
}
