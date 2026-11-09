import { randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sqlitePath } from "@/lib/db/sqlite";
import type { PhotoVariantName } from "@/lib/db/schema";
import {
  GALLERY_HEARTBEAT_STALE_MS,
  isGalleryPhotoId,
} from "@/lib/gallery/constants";
import { uploadsDir } from "@/lib/photo";

export function uploadsRoot(): string {
  return uploadsDir();
}

export function galleryRoot(): string {
  return path.join(uploadsRoot(), "gallery");
}

export function galleryTmpRoot(): string {
  return path.join(uploadsRoot(), "gallery-tmp");
}

export function heartbeatPath(): string {
  return (
    process.env.PHOTO_WORKER_HEARTBEAT ??
    path.join(path.dirname(sqlitePath()), "photo-worker.heartbeat")
  );
}

export function newGalleryId(): string {
  return randomBytes(16).toString("hex");
}

export function galleryPhotoDir(photoId: string): string {
  return path.join(galleryRoot(), photoId);
}

export function galleryOriginalPath(photoId: string, ext: string): string {
  return path.join(galleryPhotoDir(photoId), `original.${ext}`);
}

export function galleryVariantPath(
  photoId: string,
  variant: PhotoVariantName,
): string {
  return path.join(galleryPhotoDir(photoId), `${variant}.avif`);
}

export function galleryUploadDir(uploadId: string): string {
  return path.join(galleryTmpRoot(), uploadId);
}

export function galleryUploadMetaPath(uploadId: string): string {
  return path.join(galleryUploadDir(uploadId), "meta.json");
}

export function galleryUploadChunkPath(uploadId: string, index: number): string {
  return path.join(galleryUploadDir(uploadId), `${index}.part`);
}

export function writeHeartbeat(now = Date.now()): void {
  const dest = heartbeatPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, String(now));
}

export function isWorkerAlive(now = Date.now()): boolean {
  try {
    const raw = fs.readFileSync(heartbeatPath(), "utf8").trim();
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return now - at <= GALLERY_HEARTBEAT_STALE_MS;
  } catch {
    return false;
  }
}

export async function deleteGalleryPhotoDir(photoId: string): Promise<void> {
  if (!isGalleryPhotoId(photoId)) return;
  try {
    await fsp.rm(galleryPhotoDir(photoId), { recursive: true, force: true });
  } catch {
    // The row is already gone. A locked folder is left for the worker sweep.
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}
