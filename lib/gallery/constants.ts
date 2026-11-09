import type { PhotoVariantName } from "@/lib/db/schema";

export const GALLERY_PHOTO_ID_RE = /^[a-f0-9]{32}$/;
export const GALLERY_CHUNK_SIZE = 1024 * 1024;
export const GALLERY_MAX_BYTES = 25 * 1024 * 1024;
/** Same wording for the organiser UI, the upload client, and the API. */
export const GALLERY_TOO_LARGE_MESSAGE = "Photo must be 25 MB or smaller.";
export const GALLERY_UPLOAD_CONCURRENCY = 3;
export const GALLERY_CHUNK_RETRIES = 3;
/** Admin UI stale window. `deploy/ensure-photo-worker.sh` adds one write interval (20s). */
export const GALLERY_HEARTBEAT_STALE_MS = 15_000;
export const GALLERY_HEARTBEAT_WRITE_MS = 5_000;
export const GALLERY_TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const GALLERY_WORKER_POLL_MS = 250;
export const GALLERY_ADMIN_POLL_MS = 5_000;
export const GALLERY_AVIF_QUALITY = 50;
export const GALLERY_AVIF_EFFORT = 9;
export const GALLERY_AVIF_CHROMA = "4:2:0" as const;
export const GALLERY_VARIANT_MIME = "image/avif";

export const GALLERY_VARIANTS = [
  "thumb",
  "hd",
  "fhd",
  "uhd",
] as const satisfies readonly PhotoVariantName[];

export const GALLERY_VARIANT_SPECS = [
  { name: "thumb" as const, size: 400, cover: true },
  { name: "hd" as const, size: 1280, cover: false },
  { name: "fhd" as const, size: 1920, cover: false },
  { name: "uhd" as const, size: 3840, cover: false },
];

export const GALLERY_MEDIA_KINDS = [
  "thumb",
  "hd",
  "fhd",
  "uhd",
  "original",
] as const;

export type GalleryMediaKind = (typeof GALLERY_MEDIA_KINDS)[number];

export const GALLERY_MIME_BY_EXT = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
} as const;

export type GalleryExt = keyof typeof GALLERY_MIME_BY_EXT;

export function isGalleryPhotoId(value: string): boolean {
  return GALLERY_PHOTO_ID_RE.test(value);
}

export function isGalleryMediaKind(value: string): value is GalleryMediaKind {
  return (GALLERY_MEDIA_KINDS as readonly string[]).includes(value);
}

export function galleryChunkCount(
  size: number,
  chunkSize = GALLERY_CHUNK_SIZE,
): number {
  if (size <= 0 || chunkSize <= 0) return 0;
  return Math.ceil(size / chunkSize);
}
