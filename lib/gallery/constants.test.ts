import { describe, expect, it } from "vitest";
import {
  GALLERY_HEARTBEAT_STALE_MS,
  GALLERY_HEARTBEAT_WRITE_MS,
  GALLERY_MAX_BYTES,
  GALLERY_TOO_LARGE_MESSAGE,
  GALLERY_WORKER_POLL_MS,
  galleryChunkCount,
  isGalleryMediaKind,
  isGalleryPhotoId,
} from "@/lib/gallery/constants";

describe("gallery constants", () => {
  it("shares one too-large message for the 25 MB cap", () => {
    expect(GALLERY_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(GALLERY_TOO_LARGE_MESSAGE).toBe("Photo must be 25 MB or smaller.");
  });

  it("accepts 32-char hex photo ids", () => {
    expect(isGalleryPhotoId("a".repeat(32))).toBe(true);
    expect(isGalleryPhotoId("A".repeat(32))).toBe(false);
    expect(isGalleryPhotoId("ab")).toBe(false);
  });

  it("recognises media names", () => {
    expect(isGalleryMediaKind("thumb")).toBe(true);
    expect(isGalleryMediaKind("original")).toBe(true);
    expect(isGalleryMediaKind("tiny")).toBe(false);
  });

  it("counts chunks", () => {
    expect(galleryChunkCount(0)).toBe(0);
    expect(galleryChunkCount(-1)).toBe(0);
    expect(galleryChunkCount(1, 0)).toBe(0);
    expect(galleryChunkCount(1)).toBe(1);
    expect(galleryChunkCount(1024 * 1024 + 1)).toBe(2);
  });

  it("writes the worker heartbeat slower than the job poll and inside the stale window", () => {
    expect(GALLERY_HEARTBEAT_WRITE_MS).toBe(5_000);
    expect(GALLERY_HEARTBEAT_WRITE_MS).toBeLessThan(GALLERY_HEARTBEAT_STALE_MS);
    expect(GALLERY_WORKER_POLL_MS).toBeLessThan(GALLERY_HEARTBEAT_WRITE_MS);
  });
});
