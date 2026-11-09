import convert from "heic-convert";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PhotoVariantName } from "@/lib/db/schema";
import {
  GALLERY_AVIF_CHROMA,
  GALLERY_AVIF_EFFORT,
  GALLERY_AVIF_QUALITY,
  GALLERY_MIME_BY_EXT,
  GALLERY_VARIANT_SPECS,
  type GalleryExt,
} from "@/lib/gallery/constants";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heif", "mif1", "msf1"]);

export type OrientedPixels = {
  buf: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
};

export type HeicConvert = (opts: {
  buffer: Buffer;
  format: "JPEG" | "PNG";
}) => Promise<ArrayBuffer>;

export type ExifParser = (
  bytes: Buffer,
) => Promise<{ DateTimeOriginal?: unknown; CreateDate?: unknown } | null>;

const defaultHeicConvert: HeicConvert = (opts) =>
  convert({ buffer: opts.buffer, format: opts.format });

const defaultParseExif: ExifParser = async (bytes) => {
  const exifr = await import("exifr");
  return exifr.parse(bytes, { pick: ["DateTimeOriginal", "CreateDate"] });
};

let heicConvert: HeicConvert = defaultHeicConvert;
let parseExif: ExifParser = defaultParseExif;

export function setHeicConvert(fn: HeicConvert): void {
  heicConvert = fn;
}

export function setExifParser(fn: ExifParser): void {
  parseExif = fn;
}

export function resetGalleryEncodeHooks(): void {
  heicConvert = defaultHeicConvert;
  parseExif = defaultParseExif;
}

export function sniffHeic(bytes: Buffer): boolean {
  if (!bytes || bytes.length < 12) return false;
  if (bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  return HEIC_BRANDS.has(bytes.toString("ascii", 8, 12).toLowerCase());
}

export function sniffImage(
  bytes: Buffer,
): { ext: GalleryExt; mime: string } | null {
  let ext: GalleryExt | null = null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    ext = "jpg";
  } else if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    ext = "png";
  } else if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    ext = "webp";
  } else if (sniffHeic(bytes)) {
    const brand = bytes.toString("ascii", 8, 12).toLowerCase();
    ext =
      brand === "heif" || brand === "mif1" || brand === "msf1" ? "heif" : "heic";
  }
  return ext ? { ext, mime: GALLERY_MIME_BY_EXT[ext] } : null;
}

function dateFromExifValue(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const normalized = raw.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export async function captureDate(
  bytes: Buffer,
  fallback: Date,
): Promise<Date> {
  try {
    const parsed = await parseExif(bytes);
    const fromExif =
      dateFromExifValue(parsed?.DateTimeOriginal) ??
      dateFromExifValue(parsed?.CreateDate);
    if (fromExif) return fromExif;
  } catch {
    // EXIF is best-effort
  }
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function findVariantSpec(name: string) {
  return GALLERY_VARIANT_SPECS.find((spec) => spec.name === name) ?? null;
}

export function dimensionsFromMetadata(meta: {
  width?: number;
  height?: number;
  orientation?: number;
}): { width: number; height: number } {
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("Could not read that photo.");
  }
  const swap = (meta.orientation ?? 1) >= 5;
  return swap ? { width: height, height: width } : { width, height };
}

/**
 * Header size for complete-upload. Does not expand pixels.
 * HEIC/HEIF is 1×1 until the worker overwrites the row.
 */
export async function imageDimensions(
  bytes: Buffer,
): Promise<{ width: number; height: number }> {
  if (sniffHeic(bytes)) return { width: 1, height: 1 };
  let meta;
  try {
    meta = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: 50_000_000,
    }).metadata();
  } catch {
    throw new Error("Could not read that photo.");
  }
  return dimensionsFromMetadata(meta);
}

/**
 * Decode + autorotate into uncompressed sRGB pixels.
 * HEIC goes through PNG, not JPEG, so AVIF is not a transcode of a lossy
 * intermediate. Display P3 photos are converted to sRGB.
 */
export async function orientedBuffer(bytes: Buffer): Promise<OrientedPixels> {
  let source: Buffer = bytes;
  if (sniffHeic(bytes)) {
    try {
      source = Buffer.from(
        await heicConvert({ buffer: bytes, format: "PNG" }),
      );
    } catch {
      source = bytes;
    }
  }
  const result = await sharp(source, {
    failOn: "error",
    limitInputPixels: 50_000_000,
  })
    .rotate()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    buf: result.data,
    width: result.info.width,
    height: result.info.height,
    channels: result.info.channels,
  };
}

export function sharpFromOriented(oriented: OrientedPixels) {
  return sharp(oriented.buf, {
    failOn: "error",
    raw: {
      width: oriented.width,
      height: oriented.height,
      channels: oriented.channels,
    },
  });
}

export async function encodeVariant(
  oriented: OrientedPixels,
  variant: PhotoVariantName,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const spec = findVariantSpec(variant);
  if (!spec) {
    throw new Error(`unknown variant ${variant}`);
  }
  let pipeline = sharpFromOriented(oriented);
  if (spec.cover) {
    pipeline = pipeline.resize(spec.size, spec.size, { fit: "cover" });
  } else {
    pipeline = pipeline.resize({
      width: spec.size,
      height: spec.size,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const encoded = await pipeline
    .withIccProfile("srgb")
    .avif({
      quality: GALLERY_AVIF_QUALITY,
      effort: GALLERY_AVIF_EFFORT,
      chromaSubsampling: GALLERY_AVIF_CHROMA,
    })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: encoded.data,
    width: encoded.info.width,
    height: encoded.info.height,
  };
}

export async function writeVariantFile(
  dest: string,
  bytes: Buffer,
): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, dest);
}
