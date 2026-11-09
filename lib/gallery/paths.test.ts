import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteGalleryPhotoDir,
  galleryOriginalPath,
  galleryPhotoDir,
  galleryRoot,
  galleryTmpRoot,
  galleryUploadChunkPath,
  galleryUploadDir,
  galleryUploadMetaPath,
  galleryVariantPath,
  heartbeatPath,
  isWorkerAlive,
  newGalleryId,
  uploadsRoot,
  writeHeartbeat,
} from "@/lib/gallery/paths";
import { withUploadsDir } from "@/test/helpers/gallery";

describe("gallery paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("nests files under UPLOADS_DIR", async () => {
    const { dir, cleanup } = await withUploadsDir();
    const id = "a".repeat(32);
    expect(uploadsRoot()).toBe(dir);
    expect(galleryRoot()).toBe(path.join(dir, "gallery"));
    expect(galleryTmpRoot()).toBe(path.join(dir, "gallery-tmp"));
    expect(galleryPhotoDir(id)).toBe(path.join(dir, "gallery", id));
    expect(galleryOriginalPath(id, "jpg")).toBe(
      path.join(dir, "gallery", id, "original.jpg"),
    );
    expect(galleryVariantPath(id, "thumb")).toBe(
      path.join(dir, "gallery", id, "thumb.avif"),
    );
    expect(galleryUploadDir(id)).toBe(path.join(dir, "gallery-tmp", id));
    expect(galleryUploadMetaPath(id)).toBe(
      path.join(dir, "gallery-tmp", id, "meta.json"),
    );
    expect(galleryUploadChunkPath(id, 2)).toBe(
      path.join(dir, "gallery-tmp", id, "2.part"),
    );
    expect(newGalleryId()).toMatch(/^[a-f0-9]{32}$/);
    await cleanup();
  });

  it("falls back to the sqlite folder when UPLOADS_DIR is unset", () => {
    vi.stubEnv("SQLITE_PATH", "data/santa.sqlite");
    expect(uploadsRoot()).toBe(path.join("data", "uploads"));
    expect(heartbeatPath()).toBe(path.join("data", "photo-worker.heartbeat"));
  });

  it("reads a custom heartbeat path", async () => {
    const { dir, cleanup } = await withUploadsDir();
    const dest = path.join(dir, "beat");
    vi.stubEnv("PHOTO_WORKER_HEARTBEAT", dest);
    expect(isWorkerAlive()).toBe(false);
    writeHeartbeat(1_000);
    expect(fs.readFileSync(dest, "utf8")).toBe("1000");
    expect(isWorkerAlive(1_000 + 14_000)).toBe(true);
    expect(isWorkerAlive(1_000 + 15_001)).toBe(false);
    fs.writeFileSync(dest, "nope");
    expect(isWorkerAlive()).toBe(false);
    await cleanup();
  });

  it("deletes a photo folder and ignores a missing or invalid id", async () => {
    const { cleanup } = await withUploadsDir();
    const id = "b".repeat(32);
    await fsp.mkdir(galleryPhotoDir(id), { recursive: true });
    await fsp.writeFile(galleryOriginalPath(id, "jpg"), "x");
    await deleteGalleryPhotoDir("nope");
    expect(fs.existsSync(galleryPhotoDir(id))).toBe(true);
    await deleteGalleryPhotoDir(id);
    expect(fs.existsSync(galleryPhotoDir(id))).toBe(false);
    await deleteGalleryPhotoDir(id);
    vi.spyOn(fsp, "rm").mockRejectedValueOnce(new Error("busy"));
    await deleteGalleryPhotoDir(id);
    await cleanup();
  });
});
