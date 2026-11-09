import { afterEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import {
  galleryUploadTooLarge,
  runUploadPool,
  uploadGalleryFile,
} from "@/lib/gallery/upload-client";
import {
  GALLERY_MAX_BYTES,
  GALLERY_TOO_LARGE_MESSAGE,
} from "@/lib/gallery/constants";

const UPLOAD_ID = "u".repeat(32);
const PHOTO_ID = "p".repeat(32);

function ok<T>(data: T, status = 200) {
  return { ok: true as const, data, error: null, status };
}

function fail(error: string, status = 400) {
  return { ok: false as const, data: null, error, status };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function initOk(chunkSize: number, chunkCount: number) {
  return ok({ uploadId: UPLOAD_ID, chunkSize, chunkCount });
}

function parseChunkIndex(url: unknown): number | null {
  const match = String(url).match(/\/uploads\/[^/]+\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function isCompleteUrl(url: unknown): boolean {
  return String(url).endsWith("/complete");
}

afterEach(() => {
  vi.unstubAllGlobals();
  requestJson.mockReset();
});

describe("uploadGalleryFile", () => {
  it("rejects an oversized file without calling the API", async () => {
    expect(galleryUploadTooLarge(GALLERY_MAX_BYTES + 1)).toBe(true);
    const file = new File(["x"], "big.jpg");
    Object.defineProperty(file, "size", { value: GALLERY_MAX_BYTES + 1 });
    await expect(
      uploadGalleryFile({ code: "abcdef", file }),
    ).resolves.toMatchObject({
      error: GALLERY_TOO_LARGE_MESSAGE,
    });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("returns an init error", async () => {
    requestJson.mockResolvedValueOnce(fail("Nope"));
    const file = new File(["abc"], "a.jpg");
    await expect(
      uploadGalleryFile({ code: "abcdef", file }),
    ).resolves.toEqual(fail("Nope"));
  });

  it("uploads chunks with retries and completes", async () => {
    requestJson
      .mockResolvedValueOnce(initOk(5, 1))
      .mockResolvedValueOnce(fail("Network error.", 0))
      .mockResolvedValueOnce(ok({ ok: true }))
      .mockResolvedValueOnce(ok({ id: PHOTO_ID }, 201));
    const ratios: number[] = [];
    const file = new File(["hello"], "a.jpg", { lastModified: 99 });
    await expect(
      uploadGalleryFile({
        code: "abcdef",
        file,
        onProgress: (ratio) => ratios.push(ratio),
      }),
    ).resolves.toEqual(ok({ id: PHOTO_ID }, 201));
    expect(ratios).toEqual([1]);
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`/photos/uploads/${UPLOAD_ID}/0`),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(requestJson).toHaveBeenCalledTimes(4);
  });

  it("gives up after three chunk failures", async () => {
    requestJson
      .mockResolvedValueOnce(initOk(2, 1))
      .mockResolvedValueOnce(fail("Request failed (400).", 400))
      .mockResolvedValue(fail("Request failed (503).", 503));
    const file = new File(["ab"], "a.jpg");
    await expect(
      uploadGalleryFile({ code: "abcdef", file }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Request failed (503).",
    });
    expect(requestJson).toHaveBeenCalledTimes(4);
  });

  it("starts three chunk PUTs before complete", async () => {
    const puts = [0, 1, 2].map(() => deferred<ReturnType<typeof ok>>());
    const inFlight: number[] = [];
    let completeCalls = 0;
    requestJson.mockImplementation(async (url: unknown) => {
      if (isCompleteUrl(url)) {
        completeCalls += 1;
        return ok({ id: PHOTO_ID }, 201);
      }
      const index = parseChunkIndex(url);
      if (index != null) {
        inFlight.push(index);
        return puts[index]!.promise;
      }
      return initOk(5, 3);
    });
    const pending = uploadGalleryFile({
      code: "abcdef",
      file: new File(["hello"], "a.jpg"),
    });
    await vi.waitFor(() => expect([...inFlight].sort()).toEqual([0, 1, 2]));
    expect(completeCalls).toBe(0);
    for (const put of puts) put.resolve(ok({ ok: true }));
    await expect(pending).resolves.toEqual(ok({ id: PHOTO_ID }, 201));
    expect(completeCalls).toBe(1);
    const urls = requestJson.mock.calls.map((call) => String(call[0]));
    expect(isCompleteUrl(urls[urls.length - 1])).toBe(true);
  });

  it("reports progress by completed count when chunks finish out of order", async () => {
    const puts = [0, 1, 2].map(() => deferred<ReturnType<typeof ok>>());
    const ratios: number[] = [];
    requestJson.mockImplementation(async (url: unknown) => {
      if (isCompleteUrl(url)) return ok({ id: PHOTO_ID }, 201);
      const index = parseChunkIndex(url);
      if (index != null) return puts[index]!.promise;
      return initOk(5, 3);
    });
    const pending = uploadGalleryFile({
      code: "abcdef",
      file: new File(["hello"], "a.jpg"),
      onProgress: (ratio) => ratios.push(ratio),
    });
    await vi.waitFor(() =>
      expect(
        requestJson.mock.calls.filter((call) => parseChunkIndex(call[0]) != null),
      ).toHaveLength(3),
    );
    puts[2]!.resolve(ok({ ok: true }));
    await vi.waitFor(() => expect(ratios).toEqual([1 / 3]));
    puts[0]!.resolve(ok({ ok: true }));
    await vi.waitFor(() => expect(ratios).toEqual([1 / 3, 2 / 3]));
    puts[1]!.resolve(ok({ ok: true }));
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(ratios).toEqual([1 / 3, 2 / 3, 1]);
  });

  it("slices a short last chunk", async () => {
    const sizes: number[] = [];
    requestJson.mockImplementation(async (url: unknown, init?: unknown) => {
      if (isCompleteUrl(url)) return ok({ id: PHOTO_ID }, 201);
      const index = parseChunkIndex(url);
      if (index != null) {
        sizes[index] = (init as { body: Blob }).body.size;
        return ok({ ok: true });
      }
      return initOk(5, 2);
    });
    await expect(
      uploadGalleryFile({
        code: "abcdef",
        file: new File(["abcdefg"], "a.jpg"),
      }),
    ).resolves.toEqual(ok({ id: PHOTO_ID }, 201));
    expect(sizes).toEqual([5, 2]);
  });

  it("retries only the failing chunk among many", async () => {
    const attempts = [0, 0, 0];
    requestJson.mockImplementation(async (url: unknown) => {
      if (isCompleteUrl(url)) return ok({ id: PHOTO_ID }, 201);
      const index = parseChunkIndex(url);
      if (index != null) {
        attempts[index]! += 1;
        if (index === 1 && attempts[1] === 1) {
          return fail("Network error.", 0);
        }
        return ok({ ok: true });
      }
      return initOk(5, 3);
    });
    await expect(
      uploadGalleryFile({
        code: "abcdef",
        file: new File(["hello"], "a.jpg"),
      }),
    ).resolves.toEqual(ok({ id: PHOTO_ID }, 201));
    expect(attempts).toEqual([1, 2, 1]);
  });

  it("does not complete when one chunk exhausts retries", async () => {
    const attempts = [0, 0, 0];
    requestJson.mockImplementation(async (url: unknown) => {
      if (isCompleteUrl(url)) return ok({ id: PHOTO_ID }, 201);
      const index = parseChunkIndex(url);
      if (index != null) {
        attempts[index]! += 1;
        if (index === 0) return fail("Request failed (503).", 503);
        return ok({ ok: true });
      }
      return initOk(5, 3);
    });
    await expect(
      uploadGalleryFile({
        code: "abcdef",
        file: new File(["hello"], "a.jpg"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Request failed (503).",
    });
    expect(attempts[0]).toBe(3);
    expect(attempts[1]).toBe(1);
    expect(attempts[2]).toBe(1);
    expect(
      requestJson.mock.calls.some((call) => isCompleteUrl(call[0])),
    ).toBe(false);
  });

  it("does not start later chunks after one fails", async () => {
    const held = new Map<number, ReturnType<typeof deferred<ReturnType<typeof ok>>>>();
    const started: number[] = [];
    requestJson.mockImplementation(async (url: unknown) => {
      if (isCompleteUrl(url)) return ok({ id: PHOTO_ID }, 201);
      const index = parseChunkIndex(url);
      if (index != null) {
        started.push(index);
        if (index === 0) return fail("Nope");
        let gate = held.get(index);
        if (!gate) {
          gate = deferred<ReturnType<typeof ok>>();
          held.set(index, gate);
        }
        return gate.promise;
      }
      return initOk(1, 5);
    });
    const pending = uploadGalleryFile({
      code: "abcdef",
      file: new File(["x"], "a.jpg"),
    });
    await vi.waitFor(() =>
      expect(started.filter((index) => index === 0)).toHaveLength(3),
    );
    expect(new Set(started)).toEqual(new Set([0, 1, 2]));
    for (const gate of held.values()) {
      gate.resolve(ok({ ok: true }));
    }
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: "Nope",
    });
    expect(started.some((index) => index === 3 || index === 4)).toBe(false);
    expect(
      requestJson.mock.calls.some((call) => isCompleteUrl(call[0])),
    ).toBe(false);
  });
});

describe("runUploadPool", () => {
  it("runs nothing for an empty list and caps concurrency", async () => {
    await runUploadPool([], async () => undefined);
    const seen: number[] = [];
    await runUploadPool(
      [1, 2, 3],
      async (item) => {
        seen.push(item);
      },
      0,
    );
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  it("keeps at most the concurrency cap in flight", async () => {
    const held = [0, 1, 2, 3, 4].map(() => deferred<void>());
    let inFlight = 0;
    let max = 0;
    const seen: number[] = [];
    const running = runUploadPool(
      [0, 1, 2, 3, 4],
      async (item) => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        seen.push(item);
        await held[item]!.promise;
        inFlight -= 1;
      },
      2,
    );
    await vi.waitFor(() => expect(inFlight).toBe(2));
    expect(seen).toEqual([0, 1]);
    held[0]!.resolve();
    await vi.waitFor(() => expect(seen).toEqual([0, 1, 2]));
    expect(max).toBe(2);
    held[1]!.resolve();
    held[2]!.resolve();
    held[3]!.resolve();
    held[4]!.resolve();
    await running;
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(max).toBe(2);
  });
});
