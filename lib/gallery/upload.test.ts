import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { GalleryError } from "@/lib/errors";
import { mockDb } from "@/test/helpers/db";
import { makeEvent, makeSeries } from "@/test/helpers/fixtures";
import {
  ftypBox,
  tinyJpeg,
  tinyPng,
  withUploadsDir,
} from "@/test/helpers/gallery";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import * as encode from "@/lib/gallery/encode";
import {
  completeGalleryUpload,
  initGalleryUpload,
  parseUploadFilename,
  readUploadMeta,
  saveGalleryChunk,
} from "@/lib/gallery/upload";
import {
  GALLERY_CHUNK_SIZE,
  GALLERY_MAX_BYTES,
  GALLERY_TOO_LARGE_MESSAGE,
} from "@/lib/gallery/constants";
import {
  galleryOriginalPath,
  galleryUploadChunkPath,
  galleryUploadMetaPath,
} from "@/lib/gallery/paths";

let uploads: { dir: string; cleanup: () => Promise<void> };

beforeEach(async () => {
  uploads = await withUploadsDir();
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await uploads.cleanup();
});

describe("parseUploadFilename", () => {
  it("keeps the basename and rejects empty names", () => {
    expect(parseUploadFilename("pic.jpg")).toBe("pic.jpg");
    expect(parseUploadFilename("C:\\\\folder\\\\pic.jpg")).toBe("pic.jpg");
    expect(parseUploadFilename("a/b/c.PNG")).toBe("c.PNG");
    expect(() => parseUploadFilename("")).toThrow(GalleryError);
    expect(() => parseUploadFilename("..")).toThrow(GalleryError);
    expect(() => parseUploadFilename(".")).toThrow(GalleryError);
  });
});

describe("gallery upload", () => {
  it("starts a chunked upload", async () => {
    await expect(
      initGalleryUpload({ eventId: 1, filename: "x.jpg", size: 0 }),
    ).rejects.toMatchObject({ message: "Photo is required." });
    await expect(
      initGalleryUpload({
        eventId: 1,
        filename: "x.jpg",
        size: GALLERY_MAX_BYTES + 1,
      }),
    ).rejects.toMatchObject({ message: GALLERY_TOO_LARGE_MESSAGE });
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "x.jpg",
      size: 10,
      capturedAt: Number.NaN,
    });
    expect(started.chunkCount).toBe(1);
    const meta = await readUploadMeta(started.uploadId);
    expect(meta?.capturedAt).toBeNull();
    await fs.writeFile(galleryUploadMetaPath(started.uploadId), "{");
    expect(await readUploadMeta(started.uploadId)).toBeNull();
    expect(await readUploadMeta("nope")).toBeNull();
    expect(await readUploadMeta("z".repeat(32))).toBeNull();
  });

  it("rejects a meta file with a mismatched id", async () => {
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "x.jpg",
      size: 4,
      capturedAt: 1_700_000_000_000,
    });
    await fs.writeFile(
      galleryUploadMetaPath(started.uploadId),
      JSON.stringify({ uploadId: "other", eventId: 1 }),
    );
    expect(await readUploadMeta(started.uploadId)).toBeNull();
  });

  it("saves chunks of the expected size", async () => {
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "x.jpg",
      size: 4,
    });
    await expect(
      saveGalleryChunk({
        eventId: 2,
        uploadId: started.uploadId,
        index: 0,
        bytes: Buffer.from("abcd"),
      }),
    ).rejects.toMatchObject({ message: "Unknown upload." });
    await expect(
      saveGalleryChunk({
        eventId: 1,
        uploadId: started.uploadId,
        index: 3,
        bytes: Buffer.from("abcd"),
      }),
    ).rejects.toMatchObject({ message: "Invalid chunk." });
    await expect(
      saveGalleryChunk({
        eventId: 1,
        uploadId: started.uploadId,
        index: 0,
        bytes: Buffer.from("ab"),
      }),
    ).rejects.toMatchObject({ message: "Invalid chunk." });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: started.uploadId,
      index: 0,
      bytes: Buffer.from("abcd"),
    });
    await expect(
      fs.readFile(galleryUploadChunkPath(started.uploadId, 0), "utf8"),
    ).resolves.toBe("abcd");

    const two = await initGalleryUpload({
      eventId: 1,
      filename: "big.jpg",
      size: GALLERY_CHUNK_SIZE + 3,
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: two.uploadId,
      index: 0,
      bytes: Buffer.alloc(GALLERY_CHUNK_SIZE),
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: two.uploadId,
      index: 1,
      bytes: Buffer.alloc(3),
    });
  });

  it("completes a jpeg upload", async () => {
    const jpeg = await tinyJpeg(8, 6);
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "party.jpg",
      size: jpeg.length,
      capturedAt: Date.parse("2024-12-24T18:00:00.000Z"),
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: started.uploadId,
      index: 0,
      bytes: jpeg,
    });
    const { id } = await completeGalleryUpload({
      eventId: 1,
      uploadId: started.uploadId,
    });
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(mockDb.rows(schema.eventPhoto)[0]).toMatchObject({
      originalName: "party.jpg",
      mime: "image/jpeg",
      ext: "jpg",
      width: 8,
      height: 6,
    });
    expect(mockDb.rows(schema.eventPhotoVariant)).toHaveLength(4);
    await expect(fs.stat(galleryOriginalPath(id, "jpg"))).resolves.toBeTruthy();
  });

  it("rejects an incomplete or non-image upload", async () => {
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "x.jpg",
      size: 4,
    });
    await expect(
      completeGalleryUpload({ eventId: 2, uploadId: started.uploadId }),
    ).rejects.toMatchObject({ message: "Unknown upload." });
    await expect(
      completeGalleryUpload({ eventId: 1, uploadId: started.uploadId }),
    ).rejects.toMatchObject({ message: "Upload is incomplete." });

    const png = await tinyPng();
    const ok = await initGalleryUpload({
      eventId: 1,
      filename: "x.png",
      size: png.length,
    });
    await fs.writeFile(galleryUploadChunkPath(ok.uploadId, 0), png);
    const meta = JSON.parse(
      await fs.readFile(galleryUploadMetaPath(ok.uploadId), "utf8"),
    ) as { size: number };
    meta.size = png.length + 1;
    await fs.writeFile(galleryUploadMetaPath(ok.uploadId), JSON.stringify(meta));
    await expect(
      completeGalleryUpload({ eventId: 1, uploadId: ok.uploadId }),
    ).rejects.toMatchObject({ message: "Upload is incomplete." });

    const bad = await initGalleryUpload({
      eventId: 1,
      filename: "x.bin",
      size: 4,
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: bad.uploadId,
      index: 0,
      bytes: Buffer.from("abcd"),
    });
    await expect(
      completeGalleryUpload({ eventId: 1, uploadId: bad.uploadId }),
    ).rejects.toMatchObject({
      message: "Photo must be JPEG, PNG, WebP, or HEIC.",
    });
  });

  it("completes a HEIC upload with placeholder size", async () => {
    const heic = ftypBox("heic");
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "party.heic",
      size: heic.length,
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: started.uploadId,
      index: 0,
      bytes: heic,
    });
    const { id } = await completeGalleryUpload({
      eventId: 1,
      uploadId: started.uploadId,
    });
    expect(mockDb.rows(schema.eventPhoto)[0]).toMatchObject({
      originalName: "party.heic",
      mime: "image/heic",
      ext: "heic",
      width: 1,
      height: 1,
    });
    expect(mockDb.rows(schema.eventPhotoVariant)).toHaveLength(4);
    await expect(fs.stat(galleryOriginalPath(id, "heic"))).resolves.toBeTruthy();
  });

  it("rejects a photo whose headers cannot be read", async () => {
    const jpeg = await tinyJpeg();
    const started = await initGalleryUpload({
      eventId: 1,
      filename: "x.jpg",
      size: jpeg.length,
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: started.uploadId,
      index: 0,
      bytes: jpeg,
    });
    vi.spyOn(encode, "imageDimensions").mockRejectedValue(new Error("bad"));
    await expect(
      completeGalleryUpload({ eventId: 1, uploadId: started.uploadId }),
    ).rejects.toMatchObject({ message: "Could not read that photo." });

    vi.spyOn(encode, "imageDimensions").mockResolvedValue({
      width: 0,
      height: 0,
    });
    const again = await initGalleryUpload({
      eventId: 1,
      filename: "y.jpg",
      size: jpeg.length,
    });
    await saveGalleryChunk({
      eventId: 1,
      uploadId: again.uploadId,
      index: 0,
      bytes: jpeg,
    });
    await expect(
      completeGalleryUpload({ eventId: 1, uploadId: again.uploadId }),
    ).rejects.toMatchObject({ message: "Could not read that photo." });
  });
});
