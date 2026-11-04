import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PHOTO_MAX_BYTES,
  deletePhoto,
  isPhotoFilename,
  photoFileFromForm,
  readPhoto,
  savePhoto,
} from "./photo";

describe("isPhotoFilename", () => {
  it("accepts a 48-hex name with a known extension", () => {
    expect(isPhotoFilename(`${"ab".repeat(24)}.jpg`)).toBe(true);
    expect(isPhotoFilename("short.jpg")).toBe(false);
    expect(isPhotoFilename(`${"ab".repeat(24)}.gif`)).toBe(false);
    expect(isPhotoFilename(`../${"ab".repeat(24)}.jpg`)).toBe(false);
  });
});

describe("savePhoto / readPhoto / deletePhoto", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    delete process.env.UPLOADS_DIR;
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function tmp() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "santa-photo-"));
    dirs.push(dir);
    process.env.UPLOADS_DIR = dir;
    return dir;
  }

  it("writes, reads, and deletes a jpeg", async () => {
    await tmp();
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    const filename = await savePhoto(bytes, "image/jpeg");
    expect(isPhotoFilename(filename)).toBe(true);

    const stored = await readPhoto(filename);
    expect(stored?.mime).toBe("image/jpeg");
    expect(stored?.bytes.equals(bytes)).toBe(true);

    await deletePhoto(filename);
    await expect(readPhoto(filename)).resolves.toBeNull();
    await expect(readPhoto("not-a-photo.jpg")).resolves.toBeNull();
  });

  it("rejects an unsupported type and an oversized file", async () => {
    await tmp();
    await expect(savePhoto(Buffer.from("x"), "image/gif")).rejects.toThrow(
      "UNSUPPORTED_TYPE",
    );
    await expect(
      savePhoto(Buffer.alloc(PHOTO_MAX_BYTES + 1), "image/png"),
    ).rejects.toThrow("TOO_LARGE");
  });
});

describe("photoFileFromForm", () => {
  it("rejects a missing, non-image, or oversized file", () => {
    expect(photoFileFromForm(new FormData())).toEqual({
      error: "Photo is required.",
    });
    const pdf = new FormData();
    pdf.append("file", new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }));
    expect(photoFileFromForm(pdf)).toEqual({
      error: "Photo must be JPEG, PNG, or WebP.",
    });
    const huge = new FormData();
    huge.append(
      "file",
      new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], "x.jpg", {
        type: "image/jpeg",
      }),
    );
    expect(photoFileFromForm(huge)).toEqual({
      error: "Photo must be 2 MB or smaller.",
    });
  });

  it("returns the file when it is a supported image", () => {
    const form = new FormData();
    const file = new File([new Uint8Array([1, 2, 3])], "x.jpg", {
      type: "image/jpeg",
    });
    form.append("file", file);
    expect(photoFileFromForm(form)).toEqual({ file });
  });
});
