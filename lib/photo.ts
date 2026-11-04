import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sqlitePath } from "@/lib/db/sqlite";

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const PHOTO_FILE_RE = /^[a-f0-9]{48}\.(jpg|png|webp)$/;

function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(path.dirname(sqlitePath()), "uploads");
}

export function isPhotoFilename(name: string): boolean {
  return PHOTO_FILE_RE.test(name);
}

function photoMime(filename: string): string | null {
  const match = filename.match(PHOTO_FILE_RE);
  return match ? MIME_BY_EXT[match[1] as keyof typeof MIME_BY_EXT] : null;
}

function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

export async function savePhoto(bytes: Buffer, mime: string): Promise<string> {
  const ext = extForMime(mime);
  if (!ext) throw new Error("UNSUPPORTED_TYPE");
  if (bytes.length > PHOTO_MAX_BYTES) throw new Error("TOO_LARGE");
  const filename = `${randomBytes(24).toString("hex")}.${ext}`;
  const dir = uploadsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);
  return filename;
}

export function photoFileFromForm(
  form: FormData,
): { file: File } | { error: string } {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Photo is required." };
  }
  if (!extForMime(file.type)) {
    return { error: "Photo must be JPEG, PNG, or WebP." };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return { error: "Photo must be 2 MB or smaller." };
  }
  return { file };
}

export async function readPhoto(
  filename: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const mime = photoMime(filename);
  if (!mime) return null;
  try {
    const bytes = await fs.readFile(path.join(uploadsDir(), filename));
    return { bytes, mime };
  } catch {
    return null;
  }
}

export async function deletePhoto(filename: string | null | undefined): Promise<void> {
  if (!filename || !isPhotoFilename(filename)) return;
  try {
    await fs.unlink(path.join(uploadsDir(), filename));
  } catch {
    // already gone
  }
}
