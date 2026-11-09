import "server-only";
import { and, eq, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, schema, type DbHandle } from "@/lib/db";
import type { Event, EventPhoto } from "@/lib/db/schema";
import type { GuestLink } from "@/lib/guest-link";
import type { GalleryMediaKind } from "@/lib/gallery/constants";
import { loadGuestPhotoMediaOn } from "@/lib/gallery/store";
import { isOccursOnPast, isValidOccursOn } from "@/lib/occurs-on";

export function eventByCodeOn(
  handle: DbHandle,
  code: string,
): Event | undefined {
  if (!code) return undefined;
  return handle
    .select()
    .from(schema.event)
    .where(eq(schema.event.code, code))
    .get();
}

export function eventByIdOn(
  handle: DbHandle,
  id: number,
): Event | undefined {
  return handle
    .select()
    .from(schema.event)
    .where(eq(schema.event.id, id))
    .get();
}

/** True when this person was a giver on some draw of that earlier edition. */
export function personGaveOnEventOn(
  handle: DbHandle,
  input: {
    personId: number;
    eventId: number;
    seriesId: number;
    occursOn: string;
    drawId: number;
  },
): boolean {
  const giverGuest = alias(schema.guest, "media_giver");
  const row = handle
    .select({ id: schema.assignment.id })
    .from(schema.assignment)
    .innerJoin(schema.draw, eq(schema.assignment.drawId, schema.draw.id))
    .innerJoin(schema.event, eq(schema.draw.eventId, schema.event.id))
    .innerJoin(giverGuest, eq(schema.assignment.giverId, giverGuest.id))
    .where(
      and(
        eq(giverGuest.personId, input.personId),
        eq(schema.event.id, input.eventId),
        eq(schema.event.seriesId, input.seriesId),
        lt(schema.event.occursOn, input.occursOn),
        ne(schema.draw.id, input.drawId),
      ),
    )
    .limit(1)
    .get();
  return row != null;
}

function eventAllowedForTokenOn(
  handle: DbHandle,
  input: { personId: number; drawId: number },
  target: Event,
  current: Event,
): Event | null {
  if (target.id === current.id) {
    // Only this edition waits for the party date. Earlier years the person
    // gave in stay open so last year's pictures remain reachable.
    return isOccursOnPast(target.occursOn) ? target : null;
  }
  if (target.seriesId !== current.seriesId) return null;
  if (!isValidOccursOn(target.occursOn)) return null;
  return personGaveOnEventOn(handle, {
    personId: input.personId,
    eventId: target.id,
    seriesId: current.seriesId,
    occursOn: current.occursOn,
    drawId: input.drawId,
  })
    ? target
    : null;
}

export function galleryEventForTokenOn(
  handle: DbHandle,
  input: {
    drawEventId: number;
    personId: number;
    drawId: number;
    eventCode: string;
  },
): Event | null {
  const target = eventByCodeOn(handle, input.eventCode);
  const current = eventByIdOn(handle, input.drawEventId);
  if (!target || !current) return null;
  return eventAllowedForTokenOn(
    handle,
    { personId: input.personId, drawId: input.drawId },
    target,
    current,
  );
}

export function galleryEventForLinkOn(
  handle: DbHandle,
  link: GuestLink,
  eventCode: string,
): Event | null {
  return galleryEventForTokenOn(handle, {
    drawEventId: link.draw.eventId,
    personId: link.giver.personId,
    drawId: link.draw.id,
    eventCode,
  });
}

export async function galleryEventForLink(
  link: GuestLink,
  eventCode: string,
): Promise<Event | null> {
  return galleryEventForLinkOn(db, link, eventCode);
}

export function photoEventForLinkOn(
  handle: DbHandle,
  link: GuestLink,
  photoId: string,
): Event | null {
  const photo = handle
    .select()
    .from(schema.eventPhoto)
    .where(eq(schema.eventPhoto.id, photoId))
    .get();
  if (!photo) return null;
  const event = eventByIdOn(handle, photo.eventId);
  if (!event) return null;
  return galleryEventForLinkOn(handle, link, event.code);
}

export async function photoEventForLink(
  link: GuestLink,
  photoId: string,
): Promise<Event | null> {
  return photoEventForLinkOn(db, link, photoId);
}

export type GuestGalleryMedia = {
  photo: EventPhoto;
  variantReady: boolean;
};

export function guestGalleryMediaOn(
  handle: DbHandle,
  link: GuestLink,
  photoId: string,
  kind: GalleryMediaKind,
): GuestGalleryMedia | null {
  const row = loadGuestPhotoMediaOn(handle, {
    photoId,
    kind,
    drawEventId: link.draw.eventId,
  });
  if (!row) return null;
  if (
    !eventAllowedForTokenOn(
      handle,
      { personId: link.giver.personId, drawId: link.draw.id },
      row.target,
      row.current,
    )
  ) {
    return null;
  }
  if (!row.thumbReady) return null;
  return {
    photo: row.photo,
    variantReady:
      kind === "original" || kind === "thumb" ? true : row.variantReady,
  };
}

export async function guestGalleryMedia(
  link: GuestLink,
  photoId: string,
  kind: GalleryMediaKind,
): Promise<GuestGalleryMedia | null> {
  return guestGalleryMediaOn(db, link, photoId, kind);
}
