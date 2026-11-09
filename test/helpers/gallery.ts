import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { vi } from "vitest";
import type { EventPhotoView, ReadyPhotoView } from "@/lib/gallery/types";

export async function tinyJpeg(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 20, b: 20 },
    },
  })
    .jpeg()
    .toBuffer();
}

export async function tinyJpegWithOrientation(
  width: number,
  height: number,
  orientation: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 20, b: 20 },
    },
  })
    .jpeg()
    .withMetadata({ orientation })
    .toBuffer();
}

export async function tinyPng(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 180, b: 20 },
    },
  })
    .png()
    .toBuffer();
}

export async function tinyWebp(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 20, b: 180 },
    },
  })
    .webp()
    .toBuffer();
}

export function ftypBox(brand: string): Buffer {
  const buf = Buffer.alloc(12);
  buf.write("ftyp", 4, "ascii");
  buf.write(brand.slice(0, 4).padEnd(4, " "), 8, "ascii");
  return buf;
}

export async function withUploadsDir(): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-gal-"));
  vi.stubEnv("UPLOADS_DIR", dir);
  return {
    dir,
    async cleanup() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export function photoView(
  overrides: Partial<EventPhotoView> &
    Pick<EventPhotoView, "id"> & {
      thumb?: EventPhotoView["variants"]["thumb"]["status"];
      hd?: EventPhotoView["variants"]["hd"]["status"];
    } = { id: "a".repeat(32) },
): EventPhotoView {
  const pending = { status: "pending" as const, error: null, bytes: null };
  const variants = {
    thumb: { ...pending, status: overrides.thumb ?? "pending" },
    hd: { ...pending, status: overrides.hd ?? "pending" },
    fhd: { ...pending },
    uhd: { ...pending },
    ...overrides.variants,
  };
  return {
    originalName: "IMG_1.JPG",
    mime: "image/jpeg",
    size: 1000,
    width: 800,
    height: 600,
    capturedAt: new Date("2026-01-01T00:00:00.000Z"),
    uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    id: overrides.id,
    variants,
  };
}

export function readyPhotoView(
  overrides: Partial<ReadyPhotoView> & Pick<ReadyPhotoView, "id"> = {
    id: "a".repeat(32),
  },
): ReadyPhotoView {
  return {
    width: 800,
    height: 600,
    capturedAt: new Date("2026-01-01"),
    variants: { thumb: true, hd: true, fhd: false, uhd: false },
    ...overrides,
    id: overrides.id,
  };
}

export function allVariantStatus(
  status: EventPhotoView["variants"]["thumb"]["status"],
): EventPhotoView["variants"] {
  const cell = {
    status,
    error: status === "error" ? "boom" : null,
    bytes: null,
  };
  return {
    thumb: { ...cell },
    hd: { ...cell },
    fhd: { ...cell },
    uhd: { ...cell },
  };
}
