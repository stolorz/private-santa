import { and, asc, eq, sql } from "drizzle-orm";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { DbHandle } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import type { PhotoVariantName, PhotoVariantStatus } from "@/lib/db/schema";
import {
  GALLERY_HEARTBEAT_WRITE_MS,
  GALLERY_TMP_MAX_AGE_MS,
  GALLERY_VARIANTS,
} from "@/lib/gallery/constants";
import {
  encodeVariant,
  orientedBuffer,
  writeVariantFile,
  type OrientedPixels,
} from "@/lib/gallery/encode";
import {
  galleryOriginalPath,
  galleryRoot,
  galleryTmpRoot,
  galleryVariantPath,
  writeHeartbeat,
} from "@/lib/gallery/paths";

/** Same handle as `DbHandle`. Type-only so the photo worker does not load `server-only`. */
export type GalleryHandle = DbHandle;

const VARIANT_ORDER = sql`CASE ${schema.eventPhotoVariant.variant}
  WHEN 'thumb' THEN 0
  WHEN 'hd' THEN 1
  WHEN 'fhd' THEN 2
  WHEN 'uhd' THEN 3
  ELSE 4 END`;

const ORIENT_CACHE_MAX = 1;
const orientedCache = new Map<string, OrientedPixels>();
let claimHijack: ((variantId: number) => void) | null = null;

/** Test hook: run after selecting a pending job, before the claim update. */
export function setClaimHijack(fn: ((variantId: number) => void) | null): void {
  claimHijack = fn;
}

export type ClaimedPhotoJob = {
  variantId: number;
  photoId: string;
  variant: PhotoVariantName;
  ext: string;
};

export function rememberOriented(photoId: string, pixels: OrientedPixels): void {
  orientedCache.delete(photoId);
  orientedCache.set(photoId, pixels);
  while (orientedCache.size > ORIENT_CACHE_MAX) {
    orientedCache.delete(orientedCache.keys().next().value!);
  }
}

export function clearOrientedCache(): void {
  orientedCache.clear();
}

export async function getOriented(
  photoId: string,
  originalPath: string,
): Promise<OrientedPixels> {
  const hit = orientedCache.get(photoId);
  if (hit) {
    rememberOriented(photoId, hit);
    return hit;
  }
  const bytes = await fsp.readFile(originalPath);
  const stored = await orientedBuffer(bytes);
  rememberOriented(photoId, stored);
  return stored;
}

export function enqueueVariantsOn(
  handle: GalleryHandle,
  photoId: string,
): void {
  handle
    .insert(schema.eventPhotoVariant)
    .values(
      GALLERY_VARIANTS.map((variant) => ({
        photoId,
        variant,
        status: "pending" as const,
      })),
    )
    .run();
}

export function resetRunningOn(handle: GalleryHandle): number {
  const result = handle
    .update(schema.eventPhotoVariant)
    .set({ status: "pending", error: null })
    .where(eq(schema.eventPhotoVariant.status, "running"))
    .run();
  return result.changes;
}

export function claimNextOn(handle: GalleryHandle): ClaimedPhotoJob | null {
  const row = handle
    .select({
      variantId: schema.eventPhotoVariant.id,
      photoId: schema.eventPhoto.id,
      variant: schema.eventPhotoVariant.variant,
      ext: schema.eventPhoto.ext,
    })
    .from(schema.eventPhotoVariant)
    .innerJoin(
      schema.eventPhoto,
      eq(schema.eventPhoto.id, schema.eventPhotoVariant.photoId),
    )
    .where(eq(schema.eventPhotoVariant.status, "pending"))
    .orderBy(
      VARIANT_ORDER,
      asc(schema.eventPhoto.uploadedAt),
      asc(schema.eventPhoto.id),
      asc(schema.eventPhotoVariant.id),
    )
    .limit(1)
    .get();
  if (!row) return null;

  claimHijack?.(row.variantId);
  const claimed = handle
    .update(schema.eventPhotoVariant)
    .set({ status: "running", error: null })
    .where(
      and(
        eq(schema.eventPhotoVariant.id, row.variantId),
        eq(schema.eventPhotoVariant.status, "pending"),
      ),
    )
    .run();
  if (claimed.changes === 0) return claimNextOn(handle);
  return row;
}

export function finishJobOn(
  handle: GalleryHandle,
  variantId: number,
  patch: {
    status: PhotoVariantStatus;
    error?: string | null;
    durationMs: number;
    bytes?: number | null;
    width?: number;
    height?: number;
    photoId?: string;
  },
): void {
  handle
    .update(schema.eventPhotoVariant)
    .set({
      status: patch.status,
      error: patch.error ?? null,
      durationMs: patch.durationMs,
      bytes: patch.bytes ?? null,
    })
    .where(eq(schema.eventPhotoVariant.id, variantId))
    .run();
  if (
    patch.status === "done" &&
    patch.photoId &&
    patch.width &&
    patch.height
  ) {
    handle
      .update(schema.eventPhoto)
      .set({ width: patch.width, height: patch.height })
      .where(eq(schema.eventPhoto.id, patch.photoId))
      .run();
  }
}

export async function processClaimedOn(
  handle: GalleryHandle,
  job: ClaimedPhotoJob,
): Promise<void> {
  const t0 = Date.now();
    const beat = setInterval(() => writeHeartbeat(), GALLERY_HEARTBEAT_WRITE_MS);
  try {
    const originalPath = galleryOriginalPath(job.photoId, job.ext);
    const oriented = await getOriented(job.photoId, originalPath);
    const encoded = await encodeVariant(oriented, job.variant);
    await writeVariantFile(
      galleryVariantPath(job.photoId, job.variant),
      encoded.bytes,
    );
    finishJobOn(handle, job.variantId, {
      status: "done",
      durationMs: Date.now() - t0,
      bytes: encoded.bytes.length,
      width: oriented.width,
      height: oriented.height,
      photoId: job.photoId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not encode that photo.";
    finishJobOn(handle, job.variantId, {
      status: "error",
      error: message.replace(/\s+/g, " ").slice(0, 400),
      durationMs: Date.now() - t0,
    });
  } finally {
    clearInterval(beat);
    writeHeartbeat();
  }
}

function listSubdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function sweepOrphansOn(
  handle: GalleryHandle,
  now = Date.now(),
): Promise<{ photos: number; tmp: number }> {
  const known = new Set(
    handle
      .select({ id: schema.eventPhoto.id })
      .from(schema.eventPhoto)
      .all()
      .map((row) => row.id),
  );
  let photos = 0;
  for (const id of listSubdirs(galleryRoot())) {
    if (known.has(id)) continue;
    await fsp.rm(path.join(galleryRoot(), id), { recursive: true, force: true });
    photos += 1;
  }

  let tmp = 0;
  for (const id of listSubdirs(galleryTmpRoot())) {
    const dir = path.join(galleryTmpRoot(), id);
    let age = Number.POSITIVE_INFINITY;
    try {
      age = now - fs.statSync(dir).mtimeMs;
    } catch {
      age = Number.POSITIVE_INFINITY;
    }
    if (age < GALLERY_TMP_MAX_AGE_MS) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    tmp += 1;
  }
  return { photos, tmp };
}
