import {
  claimNextOn,
  clearOrientedCache,
  processClaimedOn,
  resetRunningOn,
  sweepOrphansOn,
  type GalleryHandle,
} from "@/lib/gallery/jobs";
import {
  GALLERY_HEARTBEAT_WRITE_MS,
  GALLERY_WORKER_POLL_MS,
} from "@/lib/gallery/constants";
import { writeHeartbeat } from "@/lib/gallery/paths";

export type PhotoWorkerHooks = {
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  now: () => number;
};

export function workerSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function workerShouldStop(): boolean {
  return false;
}

/** SIGTERM / SIGINT from `scripts/photo-worker.ts`. Returns an unbind function. */
export function installPhotoWorkerSignals(onStop: () => void): () => void {
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);
  return () => {
    process.off("SIGTERM", onStop);
    process.off("SIGINT", onStop);
  };
}

export async function tickPhotoWorker(handle: GalleryHandle): Promise<boolean> {
  const job = claimNextOn(handle);
  if (!job) return false;
  await processClaimedOn(handle, job);
  return true;
}

export function photoWorkerHooks(
  hooks: Partial<PhotoWorkerHooks> = {},
): PhotoWorkerHooks {
  return {
    sleep: hooks.sleep ?? workerSleep,
    shouldStop: hooks.shouldStop ?? workerShouldStop,
    now: hooks.now ?? Date.now,
  };
}

export async function runPhotoWorker(
  handle: GalleryHandle,
  hooks: Partial<PhotoWorkerHooks> = {},
): Promise<void> {
  const { sleep, shouldStop, now } = photoWorkerHooks(hooks);
  resetRunningOn(handle);
  await sweepOrphansOn(handle, now());
  let lastBeat = Number.NEGATIVE_INFINITY;
  const beat = () => {
    const at = now();
    if (at - lastBeat < GALLERY_HEARTBEAT_WRITE_MS) return;
    writeHeartbeat(at);
    lastBeat = at;
  };
  beat();
  while (!shouldStop()) {
    beat();
    const worked = await tickPhotoWorker(handle);
    if (worked) continue;
    clearOrientedCache();
    await sleep(GALLERY_WORKER_POLL_MS);
  }
  clearOrientedCache();
}
