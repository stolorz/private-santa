/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allVariantStatus, photoView } from "@/test/helpers/gallery";

const requestJson = vi.fn();
const uploadGalleryFile = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

vi.mock("@/lib/gallery/upload-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/gallery/upload-client")>();
  return {
    ...actual,
    uploadGalleryFile: (...args: unknown[]) => uploadGalleryFile(...args),
  };
});

import { PhotosTab } from "@/components/event-admin/photos-tab";

function ok<T>(data: T) {
  return { ok: true, data, error: null, status: 200 };
}

function fail(error: string) {
  return { ok: false, data: null, error, status: 400 };
}

const READY = photoView({
  id: "a".repeat(32),
  originalName: "ready.jpg",
  variants: allVariantStatus("done"),
});
const FAILED = photoView({
  id: "b".repeat(32),
  originalName: "fail.jpg",
  variants: {
    ...allVariantStatus("pending"),
    thumb: { status: "error", error: "boom", bytes: null },
  },
});
const PENDING = photoView({
  id: "c".repeat(32),
  originalName: "wait.jpg",
});

function fileInput() {
  return document.querySelector("input[type=file]") as HTMLInputElement;
}

function drop(files: File[]) {
  fireEvent.drop(screen.getByRole("button", { name: /Drop photos here/ }), {
    dataTransfer: { files },
  });
}

describe("PhotosTab", () => {
  beforeEach(() => {
    requestJson.mockReset();
    uploadGalleryFile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an empty gallery", () => {
    render(
      <PhotosTab code="abcdef" initial={{ photos: [], workerAlive: true }} />,
    );
    expect(screen.getByText("No photos yet.")).toBeTruthy();
    expect(screen.getByText("Gallery (0)")).toBeTruthy();
  });

  it("warns when the worker is down and shows processing", () => {
    render(
      <PhotosTab
        code="abcdef"
        initial={{ photos: [PENDING], workerAlive: false }}
      />,
    );
    expect(screen.getByText("Processing…")).toBeTruthy();
    expect(screen.getByText(/photo worker is not running/)).toBeTruthy();
  });

  it("polls while variants are still processing", async () => {
    vi.useFakeTimers();
    requestJson.mockResolvedValue(ok({ photos: [READY], workerAlive: true }));
    render(
      <PhotosTab
        code="abcdef"
        initial={{ photos: [PENDING], workerAlive: true }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(requestJson).toHaveBeenCalled();
  });

  it("uploads a file and shows progress", async () => {
    requestJson.mockResolvedValue(ok({ photos: [READY], workerAlive: true }));
    let finish: (value: ReturnType<typeof ok<{ id: string }>>) => void;
    const pendingUpload = new Promise<ReturnType<typeof ok<{ id: string }>>>(
      (resolve) => {
        finish = resolve;
      },
    );
    uploadGalleryFile.mockImplementation(
      async (opts: { onProgress?: (ratio: number) => void }) => {
        opts.onProgress?.(0.5);
        return pendingUpload;
      },
    );
    render(
      <PhotosTab code="abcdef" initial={{ photos: [], workerAlive: true }} />,
    );
    fireEvent.change(fileInput(), {
      target: {
        files: [new File(["abc"], "party.jpg", { type: "image/jpeg" })],
      },
    });
    await waitFor(() => expect(uploadGalleryFile).toHaveBeenCalled());
    expect(screen.getByText(/50%/)).toBeTruthy();
    finish!(ok({ id: READY.id }));
    await waitFor(() => expect(screen.getByText(/100%/)).toBeTruthy());
  });

  it("rejects an oversized file without calling the uploader", async () => {
    requestJson.mockResolvedValue(ok({ photos: [], workerAlive: true }));
    render(
      <PhotosTab code="abcdef" initial={{ photos: [], workerAlive: true }} />,
    );
    const huge = new File(["x"], "huge.jpg");
    Object.defineProperty(huge, "size", { value: 26 * 1024 * 1024 });
    drop([huge]);
    expect(await screen.findByText(/25 MB or smaller/)).toBeTruthy();
    expect(uploadGalleryFile).not.toHaveBeenCalled();
  });

  it("surfaces retry and delete errors", async () => {
    const user = userEvent.setup();
    requestJson.mockResolvedValueOnce(fail("Could not retry."));
    render(
      <PhotosTab
        code="abcdef"
        initial={{ photos: [FAILED], workerAlive: true }}
      />,
    );
    expect(screen.getByText("Failed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Could not retry.")).toBeTruthy();

    requestJson.mockResolvedValueOnce(fail("Could not delete."));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete.")).toBeTruthy();
  });

  it("deletes a ready photo and retries a failure from a drop", async () => {
    const user = userEvent.setup();
    requestJson.mockResolvedValue(ok({ photos: [FAILED], workerAlive: true }));
    uploadGalleryFile.mockResolvedValue(fail("nope"));
    render(
      <PhotosTab
        code="abcdef"
        initial={{ photos: [READY, FAILED], workerAlive: true }}
      />,
    );
    const thumb = screen.getByAltText("ready.jpg");
    expect(thumb.getAttribute("loading")).toBe("lazy");
    expect(thumb.getAttribute("decoding")).toBe("async");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    await waitFor(() => expect(requestJson).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        requestJson.mock.calls.some((call) =>
          String(call[0]).includes("/retry"),
        ),
      ).toBe(true),
    );

    fireEvent.dragOver(screen.getByRole("button", { name: /Drop photos here/ }));
    drop([new File(["abc"], "drop.jpg", { type: "image/jpeg" })]);
    await waitFor(() => expect(uploadGalleryFile).toHaveBeenCalled());
    expect(screen.getByText(/nope/)).toBeTruthy();
    drop([]);
    await user.click(screen.getByRole("button", { name: /Drop photos here/ }));
  });

  it("shows a refresh error", async () => {
    vi.useFakeTimers();
    requestJson.mockResolvedValue(fail("Could not load."));
    render(
      <PhotosTab
        code="abcdef"
        initial={{ photos: [PENDING], workerAlive: true }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText("Could not load.")).toBeTruthy();
  });
});
