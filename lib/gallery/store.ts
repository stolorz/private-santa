import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, schema, type DbHandle } from "@/lib/db";
import type { Event, EventPhoto, PhotoVariantName } from "@/lib/db/schema";
import { GalleryError } from "@/lib/errors";
import type { GalleryMediaKind } from "@/lib/gallery/constants";
import { deleteGalleryPhotoDir, isWorkerAlive } from "@/lib/gallery/paths";
import type {
  EventPhotoView,
  PhotoVariantView,
  ReadyPhotoView,
} from "@/lib/gallery/types";

const emptyVariants = (): Record<PhotoVariantName, PhotoVariantView> => ({
  thumb: { status: "pending", error: null, bytes: null },
  hd: { status: "pending", error: null, bytes: null },
  fhd: { status: "pending", error: null, bytes: null },
  uhd: { status: "pending", error: null, bytes: null },
});

export function assemblePhotos(
  photos: EventPhoto[],
  variantRows: Array<{
    photoId: string;
    variant: PhotoVariantName;
    status: PhotoVariantView["status"];
    error: string | null;
    bytes: number | null;
  }>,
): EventPhotoView[] {
  const byPhoto = new Map<string, Record<PhotoVariantName, PhotoVariantView>>();
  const views = photos.map((photo) => {
    const variants = emptyVariants();
    byPhoto.set(photo.id, variants);
    return {
      id: photo.id,
      originalName: photo.originalName,
      mime: photo.mime,
      size: photo.size,
      width: photo.width,
      height: photo.height,
      capturedAt: photo.capturedAt,
      uploadedAt: photo.uploadedAt,
      variants,
    };
  });
  for (const row of variantRows) {
    const slot = byPhoto.get(row.photoId);
    if (!slot) continue;
    slot[row.variant] = {
      status: row.status,
      error: row.error,
      bytes: row.bytes,
    };
  }
  return views;
}

export function listEventPhotosOn(
  handle: DbHandle,
  eventId: number,
): EventPhotoView[] {
  const photos = handle
    .select()
    .from(schema.eventPhoto)
    .where(eq(schema.eventPhoto.eventId, eventId))
    .orderBy(
      asc(schema.eventPhoto.capturedAt),
      asc(schema.eventPhoto.uploadedAt),
      asc(schema.eventPhoto.id),
    )
    .all();
  if (photos.length === 0) return [];
  const variantRows = handle
    .select({
      photoId: schema.eventPhotoVariant.photoId,
      variant: schema.eventPhotoVariant.variant,
      status: schema.eventPhotoVariant.status,
      error: schema.eventPhotoVariant.error,
      bytes: schema.eventPhotoVariant.bytes,
    })
    .from(schema.eventPhotoVariant)
    .where(
      inArray(
        schema.eventPhotoVariant.photoId,
        photos.map((photo) => photo.id),
      ),
    )
    .all();
  return assemblePhotos(photos, variantRows);
}

export async function listEventPhotos(
  eventId: number,
): Promise<EventPhotoView[]> {
  return listEventPhotosOn(db, eventId);
}

/** All photos on the edition, including those still encoding. */
export function countEventPhotosOn(
  handle: DbHandle,
  eventId: number,
): number {
  const row = handle
    .select({ n: sql<number>`count(*)` })
    .from(schema.eventPhoto)
    .where(eq(schema.eventPhoto.eventId, eventId))
    .get();
  return Number(row?.n ?? 0);
}

export async function countEventPhotos(eventId: number): Promise<number> {
  return countEventPhotosOn(db, eventId);
}

export function readyPhotoCountsOn(
  handle: DbHandle,
  eventIds: readonly number[],
): Map<number, number> {
  const counts = new Map<number, number>();
  if (eventIds.length === 0) return counts;
  const rows = handle
    .select({
      eventId: schema.eventPhoto.eventId,
      n: sql<number>`count(*)`,
    })
    .from(schema.eventPhoto)
    .innerJoin(
      schema.eventPhotoVariant,
      eq(schema.eventPhotoVariant.photoId, schema.eventPhoto.id),
    )
    .where(
      and(
        inArray(schema.eventPhoto.eventId, [...eventIds]),
        eq(schema.eventPhotoVariant.variant, "thumb"),
        eq(schema.eventPhotoVariant.status, "done"),
      ),
    )
    .groupBy(schema.eventPhoto.eventId)
    .all();
  for (const row of rows) {
    counts.set(row.eventId, Number(row.n));
  }
  return counts;
}

export function listReadyPhotosOn(
  handle: DbHandle,
  eventId: number,
): ReadyPhotoView[] {
  return listEventPhotosOn(handle, eventId)
    .filter((photo) => photo.variants.thumb.status === "done")
    .map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      capturedAt: photo.capturedAt,
      variants: {
        thumb: true,
        hd: photo.variants.hd.status === "done",
        fhd: photo.variants.fhd.status === "done",
        uhd: photo.variants.uhd.status === "done",
      },
    }));
}

export async function listReadyPhotos(
  eventId: number,
): Promise<ReadyPhotoView[]> {
  return listReadyPhotosOn(db, eventId);
}

/** Ready-thumbnail count for one edition. Used by the guest reveal page after the party. */
export async function countReadyPhotos(eventId: number): Promise<number> {
  return readyPhotoCountsOn(db, [eventId]).get(eventId) ?? 0;
}

export type GuestPhotoMediaRow = {
  photo: EventPhoto;
  target: Event;
  current: Event;
  thumbReady: boolean;
  variantReady: boolean;
};

export type AdminPhotoMediaRow = {
  photo: EventPhoto;
  variantReady: boolean;
};

function mediaRequestedVariant(kind: GalleryMediaKind): PhotoVariantName {
  return kind === "original" ? "thumb" : kind;
}

export function loadGuestPhotoMediaOn(
  handle: DbHandle,
  input: { photoId: string; kind: GalleryMediaKind; drawEventId: number },
): GuestPhotoMediaRow | undefined {
  const target = alias(schema.event, "media_target");
  const current = alias(schema.event, "media_current");
  const thumb = alias(schema.eventPhotoVariant, "media_thumb");
  const requested = alias(schema.eventPhotoVariant, "media_requested");
  const requestedVariant = mediaRequestedVariant(input.kind);
  const row = handle
    .select({
      photo: schema.eventPhoto,
      target,
      current,
      thumbStatus: thumb.status,
      requestedStatus: requested.status,
    })
    .from(schema.eventPhoto)
    .innerJoin(target, eq(target.id, schema.eventPhoto.eventId))
    .innerJoin(current, eq(current.id, input.drawEventId))
    .leftJoin(
      thumb,
      and(eq(thumb.photoId, schema.eventPhoto.id), eq(thumb.variant, "thumb")),
    )
    .leftJoin(
      requested,
      and(
        eq(requested.photoId, schema.eventPhoto.id),
        eq(requested.variant, requestedVariant),
      ),
    )
    .where(eq(schema.eventPhoto.id, input.photoId))
    .get();
  if (!row) return undefined;
  return {
    photo: row.photo,
    target: row.target,
    current: row.current,
    thumbReady: row.thumbStatus === "done",
    variantReady: row.requestedStatus === "done",
  };
}

export function loadAdminPhotoMediaOn(
  handle: DbHandle,
  input: { eventId: number; photoId: string; kind: GalleryMediaKind },
): AdminPhotoMediaRow | undefined {
  const requested = alias(schema.eventPhotoVariant, "admin_requested");
  const requestedVariant = mediaRequestedVariant(input.kind);
  const row = handle
    .select({
      photo: schema.eventPhoto,
      requestedStatus: requested.status,
    })
    .from(schema.eventPhoto)
    .leftJoin(
      requested,
      and(
        eq(requested.photoId, schema.eventPhoto.id),
        eq(requested.variant, requestedVariant),
      ),
    )
    .where(
      and(
        eq(schema.eventPhoto.id, input.photoId),
        eq(schema.eventPhoto.eventId, input.eventId),
      ),
    )
    .get();
  if (!row) return undefined;
  return {
    photo: row.photo,
    variantReady: row.requestedStatus === "done",
  };
}

export async function loadAdminPhotoMedia(input: {
  eventId: number;
  photoId: string;
  kind: GalleryMediaKind;
}): Promise<AdminPhotoMediaRow | undefined> {
  return loadAdminPhotoMediaOn(db, input);
}

export function getEventPhotoOn(
  handle: DbHandle,
  photoId: string,
): EventPhoto | undefined {
  return handle
    .select()
    .from(schema.eventPhoto)
    .where(eq(schema.eventPhoto.id, photoId))
    .get();
}

export async function getEventPhoto(
  photoId: string,
): Promise<EventPhoto | undefined> {
  return getEventPhotoOn(db, photoId);
}

export function photoIdsForEventOn(
  handle: DbHandle,
  eventId: number,
): string[] {
  return handle
    .select({ id: schema.eventPhoto.id })
    .from(schema.eventPhoto)
    .where(eq(schema.eventPhoto.eventId, eventId))
    .all()
    .map((row) => row.id);
}

export async function deleteEventPhoto(
  eventId: number,
  photoId: string,
): Promise<void> {
  const row = getEventPhotoOn(db, photoId);
  if (!row || row.eventId !== eventId) {
    throw new GalleryError("Unknown photo.", 404);
  }
  db.delete(schema.eventPhoto).where(eq(schema.eventPhoto.id, photoId)).run();
  await deleteGalleryPhotoDir(photoId);
}

export function retryFailedOn(handle: DbHandle, photoId: string): number {
  const result = handle
    .update(schema.eventPhotoVariant)
    .set({
      status: "pending",
      error: null,
      durationMs: null,
      bytes: null,
    })
    .where(
      and(
        eq(schema.eventPhotoVariant.photoId, photoId),
        eq(schema.eventPhotoVariant.status, "error"),
      ),
    )
    .run();
  return result.changes;
}

export async function retryEventPhoto(
  eventId: number,
  photoId: string,
): Promise<void> {
  const row = getEventPhotoOn(db, photoId);
  if (!row || row.eventId !== eventId) {
    throw new GalleryError("Unknown photo.", 404);
  }
  const n = retryFailedOn(db, photoId);
  if (n === 0) {
    throw new GalleryError("Nothing to retry.");
  }
}

export function variantReadyOn(
  handle: DbHandle,
  photoId: string,
  variant: PhotoVariantName,
): boolean {
  const row = handle
    .select({ status: schema.eventPhotoVariant.status })
    .from(schema.eventPhotoVariant)
    .where(
      and(
        eq(schema.eventPhotoVariant.photoId, photoId),
        eq(schema.eventPhotoVariant.variant, variant),
      ),
    )
    .get();
  return row?.status === "done";
}

export async function variantReady(
  photoId: string,
  variant: PhotoVariantName,
): Promise<boolean> {
  return variantReadyOn(db, photoId, variant);
}

export function adminPhotoListPayloadOn(
  handle: DbHandle,
  eventId: number,
  now = Date.now(),
): { photos: EventPhotoView[]; workerAlive: boolean } {
  return {
    photos: listEventPhotosOn(handle, eventId),
    workerAlive: isWorkerAlive(now),
  };
}

export async function adminPhotoListPayload(eventId: number) {
  return adminPhotoListPayloadOn(db, eventId);
}
