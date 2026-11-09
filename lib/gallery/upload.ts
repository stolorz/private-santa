import "server-only";
import fs from "node:fs/promises";
import { db, schema } from "@/lib/db";
import { GalleryError } from "@/lib/errors";
import {
  GALLERY_CHUNK_SIZE,
  GALLERY_MAX_BYTES,
  GALLERY_TOO_LARGE_MESSAGE,
  galleryChunkCount,
  isGalleryPhotoId,
} from "@/lib/gallery/constants";
import {
  captureDate,
  imageDimensions,
  sniffImage,
} from "@/lib/gallery/encode";
import { enqueueVariantsOn, type GalleryHandle } from "@/lib/gallery/jobs";
import {
  ensureDir,
  galleryOriginalPath,
  galleryPhotoDir,
  galleryUploadChunkPath,
  galleryUploadDir,
  galleryUploadMetaPath,
  newGalleryId,
} from "@/lib/gallery/paths";

export type UploadMeta = {
  eventId: number;
  uploadId: string;
  filename: string;
  size: number;
  chunkSize: number;
  chunkCount: number;
  capturedAt: number | null;
  createdAt: number;
};

function basename(filename: string): string {
  const slash = filename.replace(/\\/g, "/");
  const i = slash.lastIndexOf("/");
  return (i < 0 ? slash : slash.slice(i + 1)).trim();
}

export function parseUploadFilename(filename: string): string {
  const name = basename(filename);
  if (!name || name === "." || name === "..") {
    throw new GalleryError("A file name is required.");
  }
  return name;
}

export async function initGalleryUpload(input: {
  eventId: number;
  filename: string;
  size: number;
  capturedAt?: number | null;
}): Promise<{ uploadId: string; chunkSize: number; chunkCount: number }> {
  const filename = parseUploadFilename(input.filename);
  if (!Number.isInteger(input.size) || input.size < 1) {
    throw new GalleryError("Photo is required.");
  }
  if (input.size > GALLERY_MAX_BYTES) {
    throw new GalleryError(GALLERY_TOO_LARGE_MESSAGE);
  }
  const chunkCount = galleryChunkCount(input.size);
  const uploadId = newGalleryId();
  const capturedAt =
    input.capturedAt != null && Number.isFinite(input.capturedAt)
      ? input.capturedAt
      : null;
  const meta: UploadMeta = {
    eventId: input.eventId,
    uploadId,
    filename,
    size: input.size,
    chunkSize: GALLERY_CHUNK_SIZE,
    chunkCount,
    capturedAt,
    createdAt: Date.now(),
  };
  await ensureDir(galleryUploadDir(uploadId));
  await fs.writeFile(galleryUploadMetaPath(uploadId), JSON.stringify(meta));
  return {
    uploadId,
    chunkSize: GALLERY_CHUNK_SIZE,
    chunkCount,
  };
}

export async function readUploadMeta(
  uploadId: string,
): Promise<UploadMeta | null> {
  if (!isGalleryPhotoId(uploadId)) return null;
  try {
    const raw = await fs.readFile(galleryUploadMetaPath(uploadId), "utf8");
    const parsed = JSON.parse(raw) as UploadMeta;
    if (!parsed || parsed.uploadId !== uploadId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveGalleryChunk(input: {
  eventId: number;
  uploadId: string;
  index: number;
  bytes: Buffer;
}): Promise<void> {
  const meta = await readUploadMeta(input.uploadId);
  if (!meta || meta.eventId !== input.eventId) {
    throw new GalleryError("Unknown upload.", 404);
  }
  if (
    !Number.isInteger(input.index) ||
    input.index < 0 ||
    input.index >= meta.chunkCount
  ) {
    throw new GalleryError("Invalid chunk.");
  }
  const last = input.index === meta.chunkCount - 1;
  const expected = last
    ? meta.size - meta.chunkSize * input.index
    : meta.chunkSize;
  if (input.bytes.length !== expected) {
    throw new GalleryError("Invalid chunk.");
  }
  await fs.writeFile(
    galleryUploadChunkPath(input.uploadId, input.index),
    input.bytes,
  );
}

async function assembleChunks(meta: UploadMeta): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let i = 0; i < meta.chunkCount; i++) {
    try {
      parts.push(await fs.readFile(galleryUploadChunkPath(meta.uploadId, i)));
    } catch {
      throw new GalleryError("Upload is incomplete.");
    }
  }
  const bytes = Buffer.concat(parts);
  if (bytes.length !== meta.size) {
    throw new GalleryError("Upload is incomplete.");
  }
  return bytes;
}

export async function completeGalleryUploadOn(
  handle: GalleryHandle,
  input: { eventId: number; uploadId: string },
): Promise<{ id: string }> {
  const meta = await readUploadMeta(input.uploadId);
  if (!meta || meta.eventId !== input.eventId) {
    throw new GalleryError("Unknown upload.", 404);
  }
  const bytes = await assembleChunks(meta);
  const kind = sniffImage(bytes);
  if (!kind) {
    throw new GalleryError("Photo must be JPEG, PNG, WebP, or HEIC.");
  }
  let size;
  try {
    size = await imageDimensions(bytes);
  } catch {
    throw new GalleryError("Could not read that photo.");
  }
  if (!size.width || !size.height) {
    throw new GalleryError("Could not read that photo.");
  }
  const fallback =
    meta.capturedAt != null ? new Date(meta.capturedAt) : new Date();
  const capturedAt = await captureDate(bytes, fallback);
  const id = newGalleryId();
  await ensureDir(galleryPhotoDir(id));
  await fs.writeFile(galleryOriginalPath(id, kind.ext), bytes);
  handle
    .insert(schema.eventPhoto)
    .values({
      id,
      eventId: input.eventId,
      originalName: meta.filename,
      mime: kind.mime,
      ext: kind.ext,
      size: bytes.length,
      width: size.width,
      height: size.height,
      capturedAt,
      uploadedAt: new Date(),
    })
    .run();
  enqueueVariantsOn(handle, id);
  await fs.rm(galleryUploadDir(meta.uploadId), { recursive: true, force: true });
  return { id };
}

export async function completeGalleryUpload(input: {
  eventId: number;
  uploadId: string;
}): Promise<{ id: string }> {
  return completeGalleryUploadOn(db, input);
}
