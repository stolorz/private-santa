"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GALLERY_ADMIN_POLL_MS,
  GALLERY_MIME_BY_EXT,
  GALLERY_TOO_LARGE_MESSAGE,
} from "@/lib/gallery/constants";
import { photoGridStatus, photosNeedPoll } from "@/lib/gallery/status";
import type { EventPhotoView } from "@/lib/gallery/types";
import {
  galleryUploadTooLarge,
  runUploadPool,
  uploadGalleryFile,
} from "@/lib/gallery/upload-client";
import { requestJson } from "@/lib/fetch-json";
import { adminGalleryMediaPath, eventApiPath } from "@/lib/public-path";

type AdminList = { photos: EventPhotoView[]; workerAlive: boolean };

type ProgressRow = {
  key: string;
  name: string;
  ratio: number;
  error: string | null;
};

const ACCEPT = `${Object.values(GALLERY_MIME_BY_EXT).join(",")},.heic,.heif`;

export function PhotosTab({
  code,
  initial,
}: {
  code: string;
  initial: AdminList;
}) {
  const [photos, setPhotos] = useState(initial.photos);
  const [workerAlive, setWorkerAlive] = useState(initial.workerAlive);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await requestJson<AdminList>(eventApiPath(code, "/photos"));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPhotos(result.data.photos);
    setWorkerAlive(result.data.workerAlive);
    setError(null);
  }, [code]);

  useEffect(() => {
    if (!photosNeedPoll(photos)) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, GALLERY_ADMIN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [photos, refresh]);

  async function onFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const rows: ProgressRow[] = files.map((file, i) => ({
      key: `${file.name}-${file.size}-${i}`,
      name: file.name,
      ratio: 0,
      error: galleryUploadTooLarge(file.size)
        ? GALLERY_TOO_LARGE_MESSAGE
        : null,
    }));
    setProgress(rows);
    const pending = files
      .map((file, i) => ({ file, row: rows[i]! }))
      .filter((item) => !item.row.error);
    await runUploadPool(pending, async ({ file, row }) => {
      const result = await uploadGalleryFile({
        code,
        file,
        onProgress: (ratio) => {
          setProgress((current) =>
            current.map((item) =>
              item.key === row.key ? { ...item, ratio } : item,
            ),
          );
        },
      });
      setProgress((current) =>
        current.map((item) =>
          item.key === row.key
            ? {
                ...item,
                ratio: result.ok ? 1 : item.ratio,
                error: result.ok ? null : result.error,
              }
            : item,
        ),
      );
    });
    await refresh();
  }

  async function onDelete(id: string) {
    const result = await requestJson(eventApiPath(code, `/photos/${id}`), {
      method: "DELETE",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function onRetry(id: string) {
    const result = await requestJson(eventApiPath(code, `/photos/${id}/retry`), {
      method: "POST",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  const showWorkerWarning = !workerAlive && photosNeedPoll(photos);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload photos</CardTitle>
          <CardDescription>
            JPEG, PNG, WebP, or HEIC. Up to 25 MB each. Guests see a photo
            once its thumbnail is ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void onFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="flex min-h-32 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed px-4 py-8 text-base text-muted-foreground"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length > 0) {
                void onFiles(event.dataTransfer.files);
              }
            }}
          >
            Drop photos here, or choose files
          </button>
          {progress.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {progress.map((row) => (
                <li key={row.key}>
                  <span className="font-medium">{row.name}</span>
                  {row.error ? (
                    <span className="text-destructive"> — {row.error}</span>
                  ) : (
                    <span> — {Math.round(row.ratio * 100)}%</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {showWorkerWarning ? (
            <p className="text-sm text-destructive">
              The photo worker is not running. Thumbnails will wait until it
              starts (`npm run photos:worker`).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gallery ({photos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => {
                const status = photoGridStatus(photo);
                const thumbReady = photo.variants.thumb.status === "done";
                return (
                  <li key={photo.id} className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl bg-secondary">
                      {thumbReady ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={adminGalleryMediaPath(code, photo.id, "thumb")}
                          alt={photo.originalName}
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center px-2 text-center text-sm text-muted-foreground">
                          {status === "failed" ? "Failed" : "Processing…"}
                        </div>
                      )}
                    </div>
                    <p className="truncate text-xs" title={photo.originalName}>
                      {photo.originalName}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {status === "failed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void onRetry(photo.id)}
                        >
                          Retry
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void onDelete(photo.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
