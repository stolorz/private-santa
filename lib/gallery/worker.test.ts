import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeEventPhoto,
  makeEventPhotoVariant,
  makeSeries,
} from "@/test/helpers/fixtures";
import { withUploadsDir } from "@/test/helpers/gallery";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { db } from "@/lib/db";
import {
  GALLERY_HEARTBEAT_WRITE_MS,
  GALLERY_WORKER_POLL_MS,
} from "@/lib/gallery/constants";
import * as jobs from "@/lib/gallery/jobs";
import * as paths from "@/lib/gallery/paths";
import {
  installPhotoWorkerSignals,
  photoWorkerHooks,
  runPhotoWorker,
  tickPhotoWorker,
  workerShouldStop,
  workerSleep,
} from "@/lib/gallery/worker";

let uploads: { dir: string; cleanup: () => Promise<void> };

beforeEach(async () => {
  uploads = await withUploadsDir();
  vi.stubEnv("PHOTO_WORKER_HEARTBEAT", path.join(uploads.dir, "beat"));
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await uploads.cleanup();
});

describe("photo worker loop", () => {
  it("ticks idle when nothing is queued", async () => {
    expect(await tickPhotoWorker(db)).toBe(false);
    expect(workerShouldStop()).toBe(false);
    await workerSleep(0);
    const defaults = photoWorkerHooks();
    expect(defaults.shouldStop).toBe(workerShouldStop);
    expect(defaults.sleep).toBe(workerSleep);
    expect(defaults.now).toBe(Date.now);
  });

  it("writes a heartbeat once when asked to stop immediately", async () => {
    const beat = vi.spyOn(paths, "writeHeartbeat");
    await runPhotoWorker(db, {
      shouldStop: () => true,
      now: () => 42,
    });
    expect(beat).toHaveBeenCalledTimes(1);
    expect(beat).toHaveBeenCalledWith(42);
  });

  it("writes the idle heartbeat every 5s, not every poll", async () => {
    const beat = vi.spyOn(paths, "writeHeartbeat");
    let clock = 0;
    await runPhotoWorker(db, {
      shouldStop: () => clock > GALLERY_HEARTBEAT_WRITE_MS * 2,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    expect(beat.mock.calls.map((call) => call[0])).toEqual([
      0,
      GALLERY_HEARTBEAT_WRITE_MS,
      GALLERY_HEARTBEAT_WRITE_MS * 2,
    ]);
    expect(clock).toBeGreaterThan(GALLERY_HEARTBEAT_WRITE_MS * 2);
    expect(clock % GALLERY_WORKER_POLL_MS).toBe(0);
  });

  it("does not write at 4999ms and writes at 5000ms", async () => {
    const beat = vi.spyOn(paths, "writeHeartbeat");
    let clock = 0;
    let sleeps = 0;
    await runPhotoWorker(db, {
      shouldStop: () => sleeps >= 3,
      sleep: async () => {
        sleeps += 1;
        clock = sleeps === 1 ? GALLERY_HEARTBEAT_WRITE_MS - 1 : GALLERY_HEARTBEAT_WRITE_MS;
      },
      now: () => clock,
    });
    expect(beat.mock.calls.map((call) => call[0])).toEqual([
      0,
      GALLERY_HEARTBEAT_WRITE_MS,
    ]);
    expect(clock).toBe(GALLERY_HEARTBEAT_WRITE_MS);
  });

  it("binds SIGTERM and SIGINT on process, then unbinds", () => {
    const onStop = vi.fn();
    const onSpy = vi.spyOn(process, "on");
    const offSpy = vi.spyOn(process, "off");
    const detach = installPhotoWorkerSignals(onStop);
    expect(onSpy).toHaveBeenCalledWith("SIGTERM", onStop);
    expect(onSpy).toHaveBeenCalledWith("SIGINT", onStop);
    detach();
    expect(offSpy).toHaveBeenCalledWith("SIGTERM", onStop);
    expect(offSpy).toHaveBeenCalledWith("SIGINT", onStop);
  });

  it("processes a claimed job then sleeps until asked to stop", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto()]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({ status: "running" }),
    ]);
    const process = vi
      .spyOn(jobs, "processClaimedOn")
      .mockResolvedValue(undefined);
    const beat = vi.spyOn(paths, "writeHeartbeat");
    let loops = 0;
    await runPhotoWorker(db, {
      shouldStop: () => loops >= 2,
      sleep: async () => {
        loops += 1;
      },
      now: () => 1_000,
    });
    expect(process).toHaveBeenCalled();
    expect(beat).toHaveBeenCalledTimes(1);
    expect(beat).toHaveBeenCalledWith(1_000);
  });

  it("writes again after a job when fake time has jumped past 5s", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto()]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({ status: "running" }),
    ]);
    let clock = 0;
    let idleSleeps = 0;
    vi.spyOn(jobs, "processClaimedOn").mockImplementation(async () => {
      clock = GALLERY_HEARTBEAT_WRITE_MS;
    });
    const beat = vi.spyOn(paths, "writeHeartbeat");
    await runPhotoWorker(db, {
      shouldStop: () => idleSleeps >= 1,
      sleep: async () => {
        idleSleeps += 1;
      },
      now: () => clock,
    });
    expect(beat.mock.calls.map((call) => call[0])).toEqual([
      0,
      GALLERY_HEARTBEAT_WRITE_MS,
    ]);
  });
});
