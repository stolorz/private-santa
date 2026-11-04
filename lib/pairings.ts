import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema, type DbHandle } from "@/lib/db";
import type { Assignment, Draw, GuestView } from "@/lib/db/schema";
import {
  channelsForGuest,
  configuredInvitationChannels,
} from "@/lib/delivery/channels";
import {
  revealLinkBlockedReason,
  toRevealLinks,
  type RevealLink,
} from "@/lib/delivery-status";
import { getEventById } from "@/lib/events";
import { guestEmailById, guestsForEvent } from "@/lib/people";
import { appBaseUrl, guestPortalUrl } from "@/lib/public-path";
import { requestCache } from "@/lib/request-cache";
import { missingInvitationTemplateReason } from "@/lib/templates/fields";
import { invalidTemplatesReason } from "@/lib/templates/validate";
import { getEventTemplates } from "@/lib/templates/store";
import { wishlistItemCounts } from "@/lib/wishlist";
import { mustExist } from "@/lib/utils";

export type { RevealLink };

export function assignmentsForDraw(
  drawId: number,
  handle: DbHandle = db,
): Assignment[] {
  return handle
    .select()
    .from(schema.assignment)
    .where(eq(schema.assignment.drawId, drawId))
    .all();
}

export function latestDrawOn(
  handle: DbHandle,
  eventId: number,
): Draw | undefined {
  return handle
    .select()
    .from(schema.draw)
    .where(eq(schema.draw.eventId, eventId))
    .orderBy(desc(schema.draw.createdAt), desc(schema.draw.id))
    .get();
}

/** Newest draw row for an edition, if any. */
export const latestDrawForEvent = requestCache(
  async function latestDrawForEvent(eventId: number): Promise<Draw | undefined> {
    return latestDrawOn(db, eventId);
  },
);

export const currentDrawWithAssignments = requestCache(
  async function currentDrawWithAssignments(eventId: number): Promise<{
    draw: Draw;
    assignments: Assignment[];
  } | null> {
    const draw = await latestDrawForEvent(eventId);
    if (!draw) return null;
    return { draw, assignments: assignmentsForDraw(draw.id) };
  },
);

export function updateDrawChannels(
  drawId: number,
  channels: {
    whatsapp?: boolean;
    signal?: boolean;
    email?: boolean;
    allowSelfDraw?: boolean;
    avoidPastPairings?: boolean;
  },
): Draw {
  const [updated] = db
    .update(schema.draw)
    .set({
      ...(channels.whatsapp != null
        ? { deliverWhatsapp: channels.whatsapp }
        : {}),
      ...(channels.signal != null ? { deliverSignal: channels.signal } : {}),
      ...(channels.email != null ? { deliverEmail: channels.email } : {}),
      ...(channels.allowSelfDraw != null
        ? { allowSelfDraw: channels.allowSelfDraw }
        : {}),
      ...(channels.avoidPastPairings != null
        ? { avoidPastPairings: channels.avoidPastPairings }
        : {}),
    })
    .where(eq(schema.draw.id, drawId))
    .returning()
    .all();
  return mustExist(updated, "Could not update draw.");
}

export async function revealLinksFor(
  assignments: Assignment[],
  guests: GuestView[],
  eventId: number,
): Promise<RevealLink[]> {
  const guestIds = [
    ...new Set(assignments.flatMap((a) => [a.giverId, a.receiverId])),
  ];
  const [counts, event, channels, templates, emails] = await Promise.all([
    wishlistItemCounts(guestIds),
    getEventById(eventId),
    configuredInvitationChannels(),
    getEventTemplates(eventId),
    guestEmailById(guests),
  ]);
  const emailGuests: Array<{ name: string; language: string }> = [];
  const signalGuests: Array<{ name: string; language: string }> = [];
  for (const assignment of assignments) {
    const guest = guests.find(
      (candidate) => candidate.id === assignment.giverId,
    );
    if (!guest) continue;
    const address = emails.get(guest.id) ?? null;
    const guestChannels = channelsForGuest(guest, address, channels);
    if (guestChannels.includes("email")) {
      emailGuests.push({ name: guest.name, language: guest.language });
    }
    if (guestChannels.includes("signal")) {
      signalGuests.push({ name: guest.name, language: guest.language });
    }
  }
  const missingEmailTemplateReason = channels.email
    ? missingInvitationTemplateReason("email", emailGuests, templates)
    : null;
  const missingSignalTemplateReason = channels.signal
    ? missingInvitationTemplateReason("signal", signalGuests, templates)
    : null;
  const templatesInvalid = invalidTemplatesReason(templates);
  const blockedReasonByGiverId = new Map<number, string | null>();
  for (const giverId of new Set(
    assignments.map((assignment) => assignment.giverId),
  )) {
    blockedReasonByGiverId.set(
      giverId,
      revealLinkBlockedReason({
        giverId,
        guests,
        event,
        missingEmailTemplateReason,
        missingSignalTemplateReason,
        invalidTemplatesReason: templatesInvalid,
      }),
    );
  }
  return toRevealLinks(assignments, {
    nameById: new Map(guests.map((g) => [g.id, g.name])),
    wishlistCountByGuestId: counts,
    wishlistUpdatedAtByGuestId: new Map(
      guests.map((g) => [g.id, g.wishlistUpdatedAt]),
    ),
    urlFor: (token) => guestPortalUrl(appBaseUrl(), token),
    blockedReasonByGiverId,
  });
}

export interface CurrentDrawView {
  draw: Draw;
  revealLinks: RevealLink[];
  /** Guest ids that already have someone to give to (unsorted pairing). */
  assignedGiverIds: number[];
  /** Guest ids that already have a giver (unsorted pairing). */
  assignedReceiverIds: number[];
}

/** The event's current draw (newest row) with guest reveal URLs. */
export async function getCurrentDraw(
  eventId: number,
): Promise<CurrentDrawView | null> {
  const current = await currentDrawWithAssignments(eventId);
  if (!current) return null;

  const guests = await guestsForEvent(eventId);
  const assignedGiverIds = [
    ...new Set(current.assignments.map((a) => a.giverId)),
  ].sort((a, b) => a - b);
  const assignedReceiverIds = [
    ...new Set(current.assignments.map((a) => a.receiverId)),
  ].sort((a, b) => a - b);
  return {
    draw: current.draw,
    revealLinks: await revealLinksFor(current.assignments, guests, eventId),
    assignedGiverIds,
    assignedReceiverIds,
  };
}

async function assignmentInEvent(
  token: string,
  eventId: number,
): Promise<{ assignment: Assignment; draw: Draw } | null> {
  const assignment = db
    .select()
    .from(schema.assignment)
    .where(eq(schema.assignment.revealToken, token))
    .get();
  if (!assignment) return null;
  const draw = db
    .select()
    .from(schema.draw)
    .where(eq(schema.draw.id, assignment.drawId))
    .get();
  if (!draw || draw.eventId !== eventId) return null;
  return { assignment, draw };
}

export async function setAssignmentDelivery(
  token: string,
  eventId: number,
  flags: {
    whatsapp: boolean;
    signal: boolean;
    email: boolean;
    manual: boolean;
  },
): Promise<Assignment | null> {
  const found = await assignmentInEvent(token, eventId);
  if (!found) return null;
  const [updated] = await db
    .update(schema.assignment)
    .set({
      deliveredWhatsapp: flags.whatsapp,
      deliveredSignal: flags.signal,
      deliveredEmail: flags.email,
      deliveredManual: flags.manual,
    })
    .where(eq(schema.assignment.id, found.assignment.id))
    .returning();
  return updated ?? null;
}

export async function deleteAssignmentInEvent(
  token: string,
  eventId: number,
): Promise<{ ok: true; drawDeleted: boolean } | null> {
  const found = await assignmentInEvent(token, eventId);
  if (!found) return null;
  return db.transaction((tx) => {
    tx.delete(schema.assignment)
      .where(eq(schema.assignment.id, found.assignment.id))
      .run();
    const remaining = tx
      .select({ id: schema.assignment.id })
      .from(schema.assignment)
      .where(eq(schema.assignment.drawId, found.draw.id))
      .all();
    let drawDeleted = false;
    if (remaining.length === 0) {
      tx.delete(schema.draw).where(eq(schema.draw.id, found.draw.id)).run();
      drawDeleted = true;
    }
    return { ok: true as const, drawDeleted };
  });
}
