import {
  GALLERY_CHUNK_RETRIES,
  GALLERY_MAX_BYTES,
  GALLERY_TOO_LARGE_MESSAGE,
  GALLERY_UPLOAD_CONCURRENCY,
} from "@/lib/gallery/constants";
import { eventApiPath } from "@/lib/public-path";
import { jsonBody, requestJson, type JsonResult } from "@/lib/fetch-json";

export { GALLERY_MAX_BYTES, GALLERY_UPLOAD_CONCURRENCY };

export type UploadInit = {
  uploadId: string;
  chunkSize: number;
  chunkCount: number;
};

export function galleryUploadTooLarge(size: number): boolean {
  return size > GALLERY_MAX_BYTES;
}

async function putChunk(
  url: string,
  bytes: Blob,
): Promise<JsonResult<unknown>> {
  let last = await requestJson<unknown>(url, { method: "PUT", body: bytes });
  for (
    let attempt = 1;
    attempt < GALLERY_CHUNK_RETRIES && !last.ok;
    attempt++
  ) {
    last = await requestJson<unknown>(url, { method: "PUT", body: bytes });
  }
  return last;
}

export async function uploadGalleryFile(opts: {
  code: string;
  file: File;
  onProgress?: (ratio: number) => void;
}): Promise<JsonResult<{ id: string }>> {
  if (galleryUploadTooLarge(opts.file.size)) {
    return {
      ok: false,
      data: null,
      error: GALLERY_TOO_LARGE_MESSAGE,
      status: 400,
    };
  }
  const started = await requestJson<UploadInit>(
    eventApiPath(opts.code, "/photos/uploads"),
    {
      method: "POST",
      ...jsonBody({
        filename: opts.file.name,
        size: opts.file.size,
        capturedAt: opts.file.lastModified,
      }),
    },
  );
  if (!started.ok) return started;
  const { uploadId, chunkSize, chunkCount } = started.data;
  const indexes = Array.from({ length: chunkCount }, (_, i) => i);
  let done = 0;
  let failed: JsonResult<{ id: string }> | null = null;
  await runUploadPool(indexes, async (i) => {
    if (failed) return;
    const put = await putChunk(
      eventApiPath(opts.code, `/photos/uploads/${uploadId}/${i}`),
      opts.file.slice(
        i * chunkSize,
        Math.min(opts.file.size, (i + 1) * chunkSize),
      ),
    );
    if (!put.ok) {
      failed = put;
      return;
    }
    done += 1;
    opts.onProgress?.(done / chunkCount);
  });
  if (failed) return failed;
  return requestJson<{ id: string }>(
    eventApiPath(opts.code, `/photos/uploads/${uploadId}/complete`),
    { method: "POST" },
  );
}

export async function runUploadPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency = GALLERY_UPLOAD_CONCURRENCY,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, concurrency);
  let next = 0;
  async function pump() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => pump()),
  );
}
