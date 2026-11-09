import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { GalleryError } from "@/lib/errors";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeEventPhoto,
  makeEventPhotoVariant,
  makeSeries,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import {
  adminPhotoListPayload,
  assemblePhotos,
  countEventPhotos,
  countEventPhotosOn,
  countReadyPhotos,
  deleteEventPhoto,
  getEventPhoto,
  listEventPhotos,
  listReadyPhotos,
  loadAdminPhotoMediaOn,
  loadGuestPhotoMediaOn,
  photoIdsForEventOn,
  readyPhotoCountsOn,
  retryEventPhoto,
  variantReady,
} from "@/lib/gallery/store";
import { db } from "@/lib/db";

const A = "a".repeat(32);
const B = "b".repeat(32);

beforeEach(() => {
  vi.stubEnv("PHOTO_WORKER_HEARTBEAT", "data/missing-photo-worker.heartbeat");
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
});

describe("assemblePhotos", () => {
  it("fills missing variants and ignores unknown photo ids", () => {
    const photo = makeEventPhoto({ id: A });
    const views = assemblePhotos(
      [photo],
      [
        {
          photoId: A,
          variant: "thumb",
          status: "done",
          error: null,
          bytes: 12,
        },
        {
          photoId: "zzz",
          variant: "hd",
          status: "done",
          error: null,
          bytes: 1,
        },
      ],
    );
    expect(views[0]?.variants.thumb.status).toBe("done");
    expect(views[0]?.variants.hd.status).toBe("pending");
  });
});

describe("event photo store", () => {
  it("lists photos oldest first and counts ready thumbs", async () => {
    expect(await listEventPhotos(1)).toEqual([]);
    expect(await countEventPhotos(1)).toBe(0);
    expect(readyPhotoCountsOn(db, []).size).toBe(0);

    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({
        id: B,
        capturedAt: new Date("2026-01-02"),
        originalName: "later.jpg",
      }),
      makeEventPhoto({
        id: A,
        capturedAt: new Date("2026-01-01"),
        originalName: "early.jpg",
      }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: A,
        variant: "thumb",
        status: "done",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: A,
        variant: "hd",
        status: "pending",
      }),
      makeEventPhotoVariant({
        id: 3,
        photoId: B,
        variant: "thumb",
        status: "pending",
      }),
    ]);

    const listed = await listEventPhotos(1);
    expect(listed.map((row) => row.id)).toEqual([A, B]);
    expect(await countEventPhotos(1)).toBe(2);
    expect(readyPhotoCountsOn(db, [1, 2]).get(1)).toBe(1);
    const ready = await listReadyPhotos(1);
    expect(ready).toEqual([
      expect.objectContaining({
        id: A,
        variants: { thumb: true, hd: false, fhd: false, uhd: false },
      }),
    ]);
    expect(await getEventPhoto(A)).toMatchObject({ originalName: "early.jpg" });
    expect(photoIdsForEventOn(db, 1)).toEqual([A, B]);
    expect(await variantReady(A, "thumb")).toBe(true);
    expect(await variantReady(A, "hd")).toBe(false);
    const payload = await adminPhotoListPayload(1);
    expect(payload.photos).toHaveLength(2);
    expect(payload.workerAlive).toBe(false);
  });

  it("counts only photos whose thumb variant is done", async () => {
    expect(await countReadyPhotos(1)).toBe(0);
    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({ id: A }),
      makeEventPhoto({ id: B }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: A,
        variant: "thumb",
        status: "done",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: B,
        variant: "thumb",
        status: "pending",
      }),
      makeEventPhotoVariant({
        id: 3,
        photoId: B,
        variant: "hd",
        status: "done",
      }),
    ]);
    expect(await countEventPhotos(1)).toBe(2);
    expect(await countReadyPhotos(1)).toBe(1);
    expect(await countReadyPhotos(9)).toBe(0);
  });

  it("treats a missing COUNT row as zero", () => {
    const handle = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  get() {
                    return undefined;
                  },
                };
              },
            };
          },
        };
      },
    };
    expect(countEventPhotosOn(handle as never, 1)).toBe(0);
  });

  it("deletes a photo and refuses an unknown id", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: A })]);
    await expect(deleteEventPhoto(1, "nope")).rejects.toBeInstanceOf(
      GalleryError,
    );
    await expect(deleteEventPhoto(2, A)).rejects.toMatchObject({
      message: "Unknown photo.",
      status: 404,
    });
    await deleteEventPhoto(1, A);
    expect(mockDb.rows(schema.eventPhoto)).toEqual([]);
  });

  it("retries failed variants", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: A })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: A,
        variant: "thumb",
        status: "done",
      }),
    ]);
    await expect(retryEventPhoto(1, "nope")).rejects.toMatchObject({
      message: "Unknown photo.",
    });
    await expect(retryEventPhoto(1, A)).rejects.toMatchObject({
      message: "Nothing to retry.",
    });
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 2,
        photoId: A,
        variant: "hd",
        status: "error",
        error: "boom",
      }),
    ]);
    await retryEventPhoto(1, A);
    expect(mockDb.rows(schema.eventPhotoVariant)[0]?.status).toBe("pending");
  });
});

describe("photo media loaders", () => {
  it("joins guest photo, editions, and variant readiness", () => {
    expect(
      loadGuestPhotoMediaOn(db, { photoId: A, kind: "thumb", drawEventId: 1 }),
    ).toBeUndefined();
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: A })]);
    expect(
      loadGuestPhotoMediaOn(db, { photoId: A, kind: "thumb", drawEventId: 99 }),
    ).toBeUndefined();
    const pending = loadGuestPhotoMediaOn(db, {
      photoId: A,
      kind: "thumb",
      drawEventId: 1,
    });
    expect(pending).toMatchObject({
      thumbReady: false,
      variantReady: false,
      target: expect.objectContaining({ id: 1 }),
      current: expect.objectContaining({ id: 1 }),
    });
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: A,
        variant: "thumb",
        status: "done",
      }),
      makeEventPhotoVariant({
        id: 2,
        photoId: A,
        variant: "hd",
        status: "pending",
      }),
    ]);
    expect(
      loadGuestPhotoMediaOn(db, { photoId: A, kind: "thumb", drawEventId: 1 }),
    ).toMatchObject({ thumbReady: true, variantReady: true });
    expect(
      loadGuestPhotoMediaOn(db, { photoId: A, kind: "hd", drawEventId: 1 }),
    ).toMatchObject({ thumbReady: true, variantReady: false });
    expect(
      loadGuestPhotoMediaOn(db, {
        photoId: A,
        kind: "original",
        drawEventId: 1,
      }),
    ).toMatchObject({ thumbReady: true, variantReady: true });
  });

  it("loads admin media for this edition only", () => {
    expect(
      loadAdminPhotoMediaOn(db, { eventId: 1, photoId: A, kind: "thumb" }),
    ).toBeUndefined();
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: A, eventId: 1 })]);
    expect(
      loadAdminPhotoMediaOn(db, { eventId: 2, photoId: A, kind: "thumb" }),
    ).toBeUndefined();
    expect(
      loadAdminPhotoMediaOn(db, { eventId: 1, photoId: A, kind: "thumb" }),
    ).toMatchObject({ variantReady: false });
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({
        id: 1,
        photoId: A,
        variant: "hd",
        status: "done",
      }),
    ]);
    expect(
      loadAdminPhotoMediaOn(db, { eventId: 1, photoId: A, kind: "hd" }),
    ).toMatchObject({ variantReady: true });
    expect(
      loadAdminPhotoMediaOn(db, { eventId: 1, photoId: A, kind: "original" }),
    ).toMatchObject({ variantReady: false });
  });
});
