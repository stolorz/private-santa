import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeEventPhoto,
  makeEventPhotoVariant,
  makeSeries,
} from "@/test/helpers/fixtures";
import { tinyJpeg, withUploadsDir } from "@/test/helpers/gallery";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { db } from "@/lib/db";
import { GALLERY_HEARTBEAT_WRITE_MS } from "@/lib/gallery/constants";
import * as encode from "@/lib/gallery/encode";
import {
  claimNextOn,
  clearOrientedCache,
  enqueueVariantsOn,
  finishJobOn,
  getOriented,
  processClaimedOn,
  rememberOriented,
  resetRunningOn,
  setClaimHijack,
  sweepOrphansOn,
} from "@/lib/gallery/jobs";
import { retryFailedOn } from "@/lib/gallery/store";
import * as galleryPaths from "@/lib/gallery/paths";
import {
  galleryOriginalPath,
  galleryPhotoDir,
  galleryRoot,
  galleryTmpRoot,
  galleryVariantPath,
  isWorkerAlive,
  writeHeartbeat,
} from "@/lib/gallery/paths";

const PHOTO = "c".repeat(32);

let uploads: { dir: string; cleanup: () => Promise<void> };

beforeEach(async () => {
  uploads = await withUploadsDir();
  vi.stubEnv("PHOTO_WORKER_HEARTBEAT", path.join(uploads.dir, "beat"));
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
  clearOrientedCache();
  setClaimHijack(null);
});

afterEach(async () => {
  setClaimHijack(null);
  clearOrientedCache();
  vi.restoreAllMocks();
  await uploads.cleanup();
});

describe("gallery jobs", () => {
  it("enqueues four pending variants", () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: PHOTO })]);
    expect(claimNextOn(db)).toBeNull();
    enqueueVariantsOn(db, PHOTO);
    expect(mockDb.rows(schema.eventPhotoVariant)).toHaveLength(4);
  });

  it("resets running jobs and retries failures", () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: PHOTO })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: PHOTO,
        variant: "thumb",
        status: "running",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: PHOTO,
        variant: "hd",
        status: "error",
        error: "boom",
      }),
    ]);
    expect(resetRunningOn(db)).toBe(1);
    expect(retryFailedOn(db, PHOTO)).toBe(1);
    expect(
      mockDb.rows(schema.eventPhotoVariant).map((row) => row.status),
    ).toEqual(["pending", "pending"]);
  });

  it("claims thumbnails first and retries when the row was stolen", () => {
    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({
        id: "d".repeat(32),
        uploadedAt: new Date("2026-01-01"),
      }),
      makeEventPhoto({ id: PHOTO, uploadedAt: new Date("2026-01-02") }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: PHOTO,
        variant: "hd",
        status: "pending",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: "d".repeat(32),
        variant: "thumb",
        status: "pending",
      }),
      makeEventPhotoVariant({
        id: 3,
        photoId: PHOTO,
        variant: "thumb",
        status: "pending",
      }),
    ]);
    expect(claimNextOn(db)?.variantId).toBe(2);
  });

  it("claims the next job when the selected row was stolen", () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: PHOTO })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: PHOTO,
        variant: "thumb",
        status: "pending",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: PHOTO,
        variant: "hd",
        status: "pending",
      }),
    ]);
    let stolen = false;
    setClaimHijack((variantId) => {
      if (stolen) return;
      stolen = true;
      db.update(schema.eventPhotoVariant)
        .set({ status: "running" })
        .where(eq(schema.eventPhotoVariant.id, variantId))
        .run();
    });
    expect(claimNextOn(db)?.variant).toBe("hd");
    setClaimHijack(null);
    expect(claimNextOn(db)).toBeNull();
  });

  it("finishes a job and optionally writes pixel size", () => {
    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({ id: PHOTO, width: 1, height: 1 }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({ id: 1, photoId: PHOTO, status: "running" }),
    ]);
    finishJobOn(db, 1, { status: "done", durationMs: 3, bytes: 9 });
    expect(mockDb.rows(schema.eventPhoto)[0]?.width).toBe(1);
    finishJobOn(db, 1, {
      status: "done",
      durationMs: 4,
      bytes: 10,
      photoId: PHOTO,
      width: 80,
      height: 60,
    });
    expect(mockDb.rows(schema.eventPhoto)[0]).toMatchObject({
      width: 80,
      height: 60,
    });
  });

  it("encodes a claimed job and caches the oriented pixels", async () => {
    const jpeg = await tinyJpeg(10, 8);
    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({ id: PHOTO, ext: "jpg" }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: PHOTO,
        variant: "thumb",
        status: "pending",
      }),
    ]);
    await fsp.mkdir(galleryPhotoDir(PHOTO), { recursive: true });
    await fsp.writeFile(galleryOriginalPath(PHOTO, "jpg"), jpeg);
    const job = claimNextOn(db);
    expect(job).toBeTruthy();
    const interval = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((cb: TimerHandler) => {
        if (typeof cb === "function") cb();
        return 1 as unknown as ReturnType<typeof setInterval>;
      });
    const clear = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);
    const beat = vi.spyOn(galleryPaths, "writeHeartbeat");
    await processClaimedOn(db, job!);
    expect(interval).toHaveBeenCalledWith(
      expect.any(Function),
      GALLERY_HEARTBEAT_WRITE_MS,
    );
    expect(clear).toHaveBeenCalledWith(1);
    expect(beat).toHaveBeenCalled();
    expect(fs.existsSync(galleryVariantPath(PHOTO, "thumb"))).toBe(true);
    expect(mockDb.rows(schema.eventPhotoVariant)[0]?.status).toBe("done");
    const spy = vi.spyOn(encode, "orientedBuffer");
    await getOriented(PHOTO, galleryOriginalPath(PHOTO, "jpg"));
    expect(spy).not.toHaveBeenCalled();
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({
        id: 2,
        photoId: PHOTO,
        variant: "hd",
        status: "pending",
      }),
    );
    const hd = claimNextOn(db);
    expect(hd?.variant).toBe("hd");
    await processClaimedOn(db, hd!);
    expect(spy).not.toHaveBeenCalled();
    expect(
      mockDb.rows(schema.eventPhotoVariant).find((row) => row.id === 2)
        ?.status,
    ).toBe("done");
  });

  it("records a string error when encode throws a non-Error", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: PHOTO })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({ id: 1, photoId: PHOTO, status: "running" }),
    ]);
    const jpeg = await tinyJpeg();
    await fsp.mkdir(galleryPhotoDir(PHOTO), { recursive: true });
    await fsp.writeFile(galleryOriginalPath(PHOTO, "jpg"), jpeg);
    vi.spyOn(encode, "encodeVariant").mockRejectedValue("nope");
    const interval = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(() => 7 as unknown as ReturnType<typeof setInterval>);
    const clear = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);
    const beat = vi.spyOn(galleryPaths, "writeHeartbeat");
    await processClaimedOn(db, {
      variantId: 1,
      photoId: PHOTO,
      variant: "thumb",
      ext: "jpg",
    });
    expect(mockDb.rows(schema.eventPhotoVariant)[0]).toMatchObject({
      status: "error",
      error: "Could not encode that photo.",
    });
    expect(interval).toHaveBeenCalledWith(
      expect.any(Function),
      GALLERY_HEARTBEAT_WRITE_MS,
    );
    expect(clear).toHaveBeenCalledWith(7);
    expect(beat).toHaveBeenCalled();
    vi.mocked(encode.encodeVariant).mockRejectedValue(new Error("  boom\n"));
    mockDb.add(
      schema.eventPhotoVariant,
      makeEventPhotoVariant({ id: 2, photoId: PHOTO, variant: "hd", status: "running" }),
    );
    beat.mockClear();
    clear.mockClear();
    await processClaimedOn(db, {
      variantId: 2,
      photoId: PHOTO,
      variant: "hd",
      ext: "jpg",
    });
    expect(
      mockDb.rows(schema.eventPhotoVariant).find((row) => row.id === 2),
    ).toMatchObject({
      status: "error",
      error: " boom ",
    });
    expect(clear).toHaveBeenCalled();
    expect(beat).toHaveBeenCalled();
  });

  it("keeps one oriented frame and evicts the oldest", async () => {
    const first = "a".repeat(32);
    const second = "b".repeat(32);
    const jpeg = await tinyJpeg(10, 8);
    await fsp.mkdir(galleryPhotoDir(first), { recursive: true });
    await fsp.mkdir(galleryPhotoDir(second), { recursive: true });
    await fsp.writeFile(galleryOriginalPath(first, "jpg"), jpeg);
    await fsp.writeFile(galleryOriginalPath(second, "jpg"), jpeg);
    rememberOriented(first, {
      buf: Buffer.from("first"),
      width: 1,
      height: 1,
      channels: 3,
    });
    rememberOriented(second, {
      buf: Buffer.from("second"),
      width: 2,
      height: 2,
      channels: 3,
    });
    const spy = vi.spyOn(encode, "orientedBuffer");
    const hit = await getOriented(second, galleryOriginalPath(second, "jpg"));
    expect(hit).toMatchObject({ width: 2, height: 2 });
    expect(spy).not.toHaveBeenCalled();
    const miss = await getOriented(first, galleryOriginalPath(first, "jpg"));
    expect(spy).toHaveBeenCalled();
    expect(miss.width).toBe(10);
    expect(miss.height).toBe(8);
  });

  it("replaces the cached frame for the same photo id", async () => {
    rememberOriented(PHOTO, {
      buf: Buffer.from("old"),
      width: 1,
      height: 1,
      channels: 3,
    });
    rememberOriented(PHOTO, {
      buf: Buffer.from("new"),
      width: 4,
      height: 5,
      channels: 3,
    });
    const spy = vi.spyOn(encode, "orientedBuffer");
    const hit = await getOriented(PHOTO, galleryOriginalPath(PHOTO, "jpg"));
    expect(hit).toMatchObject({ width: 4, height: 5 });
    expect(hit.buf.toString()).toBe("new");
    expect(spy).not.toHaveBeenCalled();
  });

  it("drops the oriented frame on clear", async () => {
    const jpeg = await tinyJpeg(10, 8);
    await fsp.mkdir(galleryPhotoDir(PHOTO), { recursive: true });
    await fsp.writeFile(galleryOriginalPath(PHOTO, "jpg"), jpeg);
    rememberOriented(PHOTO, {
      buf: Buffer.from("cached"),
      width: 1,
      height: 1,
      channels: 3,
    });
    clearOrientedCache();
    const spy = vi.spyOn(encode, "orientedBuffer");
    const decoded = await getOriented(PHOTO, galleryOriginalPath(PHOTO, "jpg"));
    expect(spy).toHaveBeenCalled();
    expect(decoded.width).toBe(10);
    expect(decoded.height).toBe(8);
  });

  it("re-decodes the first photo after a second thumb fills the slot", async () => {
    const first = "a".repeat(32);
    const second = "b".repeat(32);
    const jpeg = await tinyJpeg(10, 8);
    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({
        id: first,
        ext: "jpg",
        uploadedAt: new Date("2026-01-01"),
      }),
      makeEventPhoto({
        id: second,
        ext: "jpg",
        uploadedAt: new Date("2026-01-02"),
      }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: first,
        variant: "thumb",
        status: "pending",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: second,
        variant: "thumb",
        status: "pending",
      }),
    ]);
    await fsp.mkdir(galleryPhotoDir(first), { recursive: true });
    await fsp.mkdir(galleryPhotoDir(second), { recursive: true });
    await fsp.writeFile(galleryOriginalPath(first, "jpg"), jpeg);
    await fsp.writeFile(galleryOriginalPath(second, "jpg"), jpeg);
    vi.spyOn(globalThis, "setInterval").mockImplementation((cb: TimerHandler) => {
      if (typeof cb === "function") cb();
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.spyOn(globalThis, "clearInterval").mockImplementation(() => undefined);
    const firstJob = claimNextOn(db);
    expect(firstJob?.photoId).toBe(first);
    await processClaimedOn(db, firstJob!);
    const secondJob = claimNextOn(db);
    expect(secondJob?.photoId).toBe(second);
    await processClaimedOn(db, secondJob!);
    const spy = vi.spyOn(encode, "orientedBuffer");
    await getOriented(second, galleryOriginalPath(second, "jpg"));
    expect(spy).not.toHaveBeenCalled();
    await getOriented(first, galleryOriginalPath(first, "jpg"));
    expect(spy).toHaveBeenCalled();
  });

  it("sweeps orphan photo folders and old temp uploads", async () => {
    const known = PHOTO;
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: known })]);
    await fsp.mkdir(galleryPhotoDir(known), { recursive: true });
    await fsp.mkdir(path.join(galleryRoot(), "orphan"), { recursive: true });
    await fsp.mkdir(path.join(galleryTmpRoot(), "fresh"), { recursive: true });
    const oldDir = path.join(galleryTmpRoot(), "old");
    await fsp.mkdir(oldDir, { recursive: true });
    const oldTime = Date.now() - 25 * 60 * 60 * 1000;
    fs.utimesSync(oldDir, new Date(oldTime), new Date(oldTime));
    const gone = path.join(galleryTmpRoot(), "gone");
    await fsp.mkdir(gone, { recursive: true });
    const origStat = fs.statSync;
    vi.spyOn(fs, "statSync").mockImplementation(((p, opts) => {
      if (String(p).includes("gone")) throw new Error("missing");
      return origStat(p, opts as never);
    }) as typeof fs.statSync);

    const result = await sweepOrphansOn(db, Date.now());
    expect(result.photos).toBe(1);
    expect(result.tmp).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(path.join(galleryRoot(), "orphan"))).toBe(false);
    expect(fs.existsSync(galleryPhotoDir(known))).toBe(true);

    await expect(sweepOrphansOn(db)).resolves.toEqual({ photos: 0, tmp: 0 });
    await fsp.rm(galleryRoot(), { recursive: true, force: true });
    await fsp.writeFile(path.join(uploads.dir, "gallery"), "file");
    await expect(sweepOrphansOn(db)).resolves.toEqual({ photos: 0, tmp: 0 });
  });

  it("reports whether the worker heartbeat is fresh", () => {
    expect(isWorkerAlive(Date.now())).toBe(false);
    writeHeartbeat(5_000);
    expect(isWorkerAlive(5_000)).toBe(true);
  });
});
