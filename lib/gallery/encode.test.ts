import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhotoVariantName } from "@/lib/db/schema";
import {
  captureDate,
  dimensionsFromMetadata,
  encodeVariant,
  findVariantSpec,
  imageDimensions,
  orientedBuffer,
  resetGalleryEncodeHooks,
  setExifParser,
  setHeicConvert,
  sniffHeic,
  sniffImage,
  writeVariantFile,
} from "@/lib/gallery/encode";
import {
  ftypBox,
  tinyJpeg,
  tinyJpegWithOrientation,
  tinyPng,
  tinyWebp,
} from "@/test/helpers/gallery";

afterEach(() => {
  resetGalleryEncodeHooks();
});

describe("sniffImage", () => {
  it("reads jpeg, png, webp and heic brands", async () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff]))).toEqual({
      ext: "jpg",
      mime: "image/jpeg",
    });
    expect(sniffImage(await tinyPng())).toEqual({
      ext: "png",
      mime: "image/png",
    });
    expect(sniffImage(await tinyWebp())).toEqual({
      ext: "webp",
      mime: "image/webp",
    });
    expect(sniffImage(ftypBox("heic"))).toEqual({
      ext: "heic",
      mime: "image/heic",
    });
    expect(sniffImage(ftypBox("heif"))).toEqual({
      ext: "heif",
      mime: "image/heif",
    });
    expect(sniffImage(ftypBox("mif1"))).toEqual({
      ext: "heif",
      mime: "image/heif",
    });
    expect(sniffImage(ftypBox("msf1"))).toEqual({
      ext: "heif",
      mime: "image/heif",
    });
    expect(sniffImage(Buffer.from("hello"))).toBeNull();
    expect(sniffHeic(null as unknown as Buffer)).toBe(false);
    expect(sniffHeic(Buffer.alloc(8))).toBe(false);
    expect(sniffHeic(Buffer.concat([Buffer.alloc(4), Buffer.from("xxxx")]))).toBe(
      false,
    );
    expect(sniffHeic(ftypBox("avif"))).toBe(false);
  });
});

describe("captureDate", () => {
  it("prefers DateTimeOriginal, then CreateDate, then the fallback", async () => {
    const fallback = new Date("2020-01-01T00:00:00.000Z");
    setExifParser(async () => ({
      DateTimeOriginal: new Date("2024-12-24T18:00:00.000Z"),
    }));
    await expect(captureDate(Buffer.from("x"), fallback)).resolves.toEqual(
      new Date("2024-12-24T18:00:00.000Z"),
    );

    setExifParser(async () => ({
      DateTimeOriginal: "2024:12:24 18:30:00",
    }));
    const fromString = await captureDate(Buffer.from("x"), fallback);
    expect(fromString.getFullYear()).toBe(2024);

    setExifParser(async () => ({ DateTimeOriginal: "nope", CreateDate: 1 }));
    await expect(captureDate(Buffer.from("x"), fallback)).resolves.toEqual(
      fallback,
    );

    setExifParser(async () => {
      throw new Error("bad exif");
    });
    await expect(captureDate(Buffer.from("x"), fallback)).resolves.toEqual(
      fallback,
    );

    const now = Date.now();
    const recovered = await captureDate(
      Buffer.from("x"),
      new Date("not a date"),
    );
    expect(recovered.getTime()).toBeGreaterThanOrEqual(now - 1000);

    setExifParser(async () => ({ DateTimeOriginal: new Date("invalid") }));
    await expect(captureDate(Buffer.from("x"), fallback)).resolves.toEqual(
      fallback,
    );

    resetGalleryEncodeHooks();
    const jpeg = await tinyJpeg();
    await expect(captureDate(jpeg, fallback)).resolves.toEqual(fallback);
  });
});

describe("imageDimensions", () => {
  it("reads jpeg, png and webp header sizes", async () => {
    await expect(imageDimensions(await tinyJpeg(12, 8))).resolves.toEqual({
      width: 12,
      height: 8,
    });
    await expect(imageDimensions(await tinyPng(6, 4))).resolves.toEqual({
      width: 6,
      height: 4,
    });
    await expect(imageDimensions(await tinyWebp(5, 7))).resolves.toEqual({
      width: 5,
      height: 7,
    });
  });

  it("swaps width and height for EXIF orientations 5–8", async () => {
    await expect(imageDimensions(await tinyJpeg(10, 4))).resolves.toEqual({
      width: 10,
      height: 4,
    });
    await expect(
      imageDimensions(await tinyJpegWithOrientation(10, 4, 1)),
    ).resolves.toEqual({ width: 10, height: 4 });
    await expect(
      imageDimensions(await tinyJpegWithOrientation(10, 4, 6)),
    ).resolves.toEqual({ width: 4, height: 10 });
    await expect(
      imageDimensions(await tinyJpegWithOrientation(10, 4, 8)),
    ).resolves.toEqual({ width: 4, height: 10 });
  });

  it("throws on garbage or missing size", async () => {
    await expect(imageDimensions(Buffer.from("not an image"))).rejects.toThrow(
      "Could not read that photo.",
    );
    expect(() => dimensionsFromMetadata({})).toThrow(
      "Could not read that photo.",
    );
    expect(() => dimensionsFromMetadata({ width: 10 })).toThrow(
      "Could not read that photo.",
    );
    expect(() => dimensionsFromMetadata({ width: 0, height: 10 })).toThrow(
      "Could not read that photo.",
    );
    expect(() => dimensionsFromMetadata({ width: 10, height: 0 })).toThrow(
      "Could not read that photo.",
    );
    expect(dimensionsFromMetadata({ width: 10, height: 4 })).toEqual({
      width: 10,
      height: 4,
    });
    expect(
      dimensionsFromMetadata({ width: 10, height: 4, orientation: 5 }),
    ).toEqual({ width: 4, height: 10 });
  });

  it("returns 1×1 for HEIC without converting", async () => {
    const convert = vi.fn();
    setHeicConvert(convert);
    await expect(imageDimensions(ftypBox("heic"))).resolves.toEqual({
      width: 1,
      height: 1,
    });
    await expect(imageDimensions(ftypBox("heif"))).resolves.toEqual({
      width: 1,
      height: 1,
    });
    expect(convert).not.toHaveBeenCalled();
  });
});

describe("orientedBuffer and encodeVariant", () => {
  it("decodes a jpeg and encodes a cover thumbnail", async () => {
    const jpeg = await tinyJpeg(12, 8);
    const oriented = await orientedBuffer(jpeg);
    expect(oriented.width).toBe(12);
    expect(oriented.height).toBe(8);
    const thumb = await encodeVariant(oriented, "thumb");
    expect(thumb.width).toBe(400);
    expect(thumb.height).toBe(400);
    const hd = await encodeVariant(oriented, "hd");
    expect(hd.width).toBeLessThanOrEqual(12);
    expect(hd.height).toBeLessThanOrEqual(8);
    expect(findVariantSpec("thumb")?.cover).toBe(true);
    expect(findVariantSpec("nope")).toBeNull();
    await expect(
      encodeVariant(oriented, "nope" as PhotoVariantName),
    ).rejects.toThrow(/unknown variant/);
  });

  it("converts HEIC through the hook, then falls back if convert fails", async () => {
    const png = await tinyPng(6, 6);
    setHeicConvert(async () => {
      const copy = Uint8Array.from(png);
      return copy.buffer as ArrayBuffer;
    });
    const fromHeic = await orientedBuffer(ftypBox("heic"));
    expect(fromHeic.width).toBe(6);

    setHeicConvert(async () => {
      throw new Error("cannot convert");
    });
    await expect(orientedBuffer(ftypBox("heix"))).rejects.toThrow();

    resetGalleryEncodeHooks();
    await expect(orientedBuffer(ftypBox("heic"))).rejects.toThrow();
  });

  it("writes a variant atomically", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-var-"));
    const dest = path.join(dir, "thumb.avif");
    await writeVariantFile(dest, Buffer.from("avif"));
    await expect(fs.readFile(dest, "utf8")).resolves.toBe("avif");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
