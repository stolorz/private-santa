import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  galleryFileResponse,
  parseGalleryMediaKind,
  serveGalleryPhoto,
  variantNotReadyResponse,
} from "@/lib/gallery/media";
import { galleryOriginalPath, galleryPhotoDir } from "@/lib/gallery/paths";
import { withUploadsDir } from "@/test/helpers/gallery";

const ID = "m".repeat(32);

let uploads: { dir: string; cleanup: () => Promise<void> };

beforeEach(async () => {
  uploads = await withUploadsDir();
});

afterEach(async () => {
  await uploads.cleanup();
});

const photo = {
  id: ID,
  ext: "jpg",
  mime: "image/jpeg",
  originalName: "święta.jpg",
};

describe("gallery media", () => {
  it("parses media kinds", () => {
    expect(parseGalleryMediaKind("thumb")).toBe("thumb");
    expect(parseGalleryMediaKind("original")).toBe("original");
    expect(parseGalleryMediaKind("tiny")).toBeNull();
  });

  it("hides unread photos from guests", async () => {
    const guest = await serveGalleryPhoto({
      photo,
      kind: "thumb",
      variantReady: false,
      guest: true,
    });
    expect(guest.status).toBe(404);
    await expect(guest.json()).resolves.toEqual({
      error: "This link is invalid.",
    });
    expect(guest.headers.get("cache-control")).toContain("no-store");

    const admin = await serveGalleryPhoto({
      photo,
      kind: "hd",
      variantReady: false,
      guest: false,
    });
    expect(admin.status).toBe(404);
    await expect(admin.json()).resolves.toEqual({ error: "Unknown photo." });
  });

  it("serves a ready variant and the original download", async () => {
    await fs.mkdir(galleryPhotoDir(ID), { recursive: true });
    await fs.writeFile(galleryOriginalPath(ID, "jpg"), "jpeg-bytes");
    const variantPath = path.join(galleryPhotoDir(ID), "thumb.avif");
    await fs.writeFile(variantPath, "avif-bytes");

    const variant = await serveGalleryPhoto({
      photo,
      kind: "thumb",
      variantReady: true,
      guest: true,
    });
    expect(variant.status).toBe(200);
    expect(variant.headers.get("content-type")).toBe("image/avif");
    expect(variant.headers.get("cache-control")).toContain("immutable");
    expect(variant.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(variant.text()).resolves.toBe("avif-bytes");

    const original = await serveGalleryPhoto({
      photo: { ...photo, originalName: "line\n\"quote\".jpg" },
      kind: "original",
      variantReady: true,
      guest: true,
    });
    expect(original.headers.get("content-disposition")).toContain("attachment");
    expect(original.headers.get("content-disposition")).toContain("filename=");
    await expect(original.text()).resolves.toBe("jpeg-bytes");

    const missing = await serveGalleryPhoto({
      photo: { ...photo, id: "n".repeat(32) },
      kind: "original",
      variantReady: true,
      guest: false,
    });
    expect(missing.status).toBe(404);
  });

  it("can send a non-durable response and a blank filename", async () => {
    const dest = path.join(uploads.dir, "plain.bin");
    await fs.writeFile(dest, "x");
    const res = await galleryFileResponse({
      filePath: dest,
      mime: "application/octet-stream",
      filename: "",
      download: false,
      durable: false,
      missing: variantNotReadyResponse(),
    });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("content-disposition")).toContain("filename=\"photo\"");
    await expect(
      galleryFileResponse({
        filePath: path.join(uploads.dir, "missing.bin"),
        mime: "text/plain",
        filename: "a",
        durable: true,
        missing: NextResponse.json({ error: "gone" }, { status: 404 }),
      }),
    ).resolves.toMatchObject({ status: 404 });
  });
});
