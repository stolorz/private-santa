"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import type { ReadyPhotoView } from "@/lib/gallery/types";
import {
  PREVIEW_ZOOM_MS,
  clampPreviewPan,
  lightboxKeyAction,
  lightboxPickedVariant,
  lightboxPreviewTapAction,
  lightboxViewport,
  neighborIndexes,
  previewZoomFromTap,
  previewZoomTransform,
  swipeDecision,
  wrapIndex,
} from "@/lib/gallery/view";
import { galleryMediaPath } from "@/lib/public-path";
import type { RevealCopy } from "@/lib/templates/render";

function photoSrc(
  token: string,
  photo: ReadyPhotoView,
  viewport: { width: number; height: number; dpr: number; zoom?: number },
): string {
  const variant = lightboxPickedVariant(photo, viewport);
  return galleryMediaPath(token, photo.id, variant || "thumb");
}

function prefetch(url: string) {
  if (typeof Image === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  void img.decode?.().catch(() => undefined);
}

export function PhotoLightbox({
  token,
  photos,
  index,
  onIndexChange,
  copy,
}: {
  token: string;
  photos: readonly ReadyPhotoView[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  copy: Pick<
    RevealCopy,
    | "galleryClose"
    | "galleryDownload"
    | "galleryPrevious"
    | "galleryNext"
  >;
}) {
  const open = index !== null && photos.length > 0;
  const photo = index !== null ? photos[index] : undefined;
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const swipe = useRef({ x: 0, y: 0, pointer: "", tracking: false });

  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    if (!open || index === null) return;
    const viewport = { ...lightboxViewport(stageRef.current), zoom: zoom.scale };
    const { prev, next } = neighborIndexes(index, photos.length);
    for (const i of [prev, next]) {
      if (i == null) continue;
      const neighbor = photos[i];
      if (neighbor) prefetch(photoSrc(token, neighbor, viewport));
    }
  }, [open, index, photos, token, zoom.scale]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      const action = lightboxKeyAction(event, { hidden: !open });
      if (!action || index === null) return;
      event.preventDefault();
      if (action === "close") onIndexChange(null);
      if (action === "prev") onIndexChange(wrapIndex(index, -1, photos.length));
      if (action === "next") onIndexChange(wrapIndex(index, 1, photos.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, photos.length, onIndexChange]);

  const viewport = {
    ...lightboxViewport(stageRef.current),
    zoom: zoom.scale,
  };
  const src = photo ? photoSrc(token, photo, viewport) : "";
  const downloadHref = photo
    ? galleryMediaPath(token, photo.id, "original")
    : "";

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onIndexChange(null);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {copy.galleryClose}
          </DialogPrimitive.Title>
          <div className="flex shrink-0 items-center justify-between gap-2 p-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onIndexChange(null)}
            >
              {copy.galleryClose}
            </Button>
            {photo ? (
              <Button asChild variant="secondary" size="sm">
                <a href={downloadHref} download>
                  {copy.galleryDownload}
                </a>
              </Button>
            ) : null}
          </div>
          <div
            ref={stageRef}
            data-lightbox-stage=""
            className="relative min-h-0 flex-1 touch-none overflow-hidden"
            onPointerDown={(event) => {
              swipe.current = {
                x: event.clientX,
                y: event.clientY,
                pointer: event.pointerType,
                tracking: true,
              };
            }}
            onPointerUp={(event) => {
              if (!swipe.current.tracking || index === null) return;
              const dx = event.clientX - swipe.current.x;
              const dy = event.clientY - swipe.current.y;
              const pointerType = swipe.current.pointer;
              swipe.current.tracking = false;
              const swipeDir = zoom.scale > 1 ? 0 : swipeDecision(dx, dy);
              if (swipeDir !== 0) {
                onIndexChange(wrapIndex(index, swipeDir, photos.length));
                return;
              }
              const action = lightboxPreviewTapAction(
                event,
                { pointerType, zoomed: zoom.scale > 1 },
              );
              if (action === "dismiss") {
                onIndexChange(null);
                return;
              }
              if (action === "zoom-out") {
                setZoom({ scale: 1, x: 0, y: 0 });
                return;
              }
              if (action === "zoom-in" && photo) {
                const box = stageRef.current?.getBoundingClientRect();
                if (!box) return;
                setZoom(
                  previewZoomFromTap(
                    event.clientX,
                    event.clientY,
                    box,
                    photo.width,
                    photo.height,
                  ),
                );
              }
            }}
            onPointerMove={(event) => {
              if (!swipe.current.tracking || zoom.scale <= 1 || !photo) return;
              const dx = event.clientX - swipe.current.x;
              const dy = event.clientY - swipe.current.y;
              swipe.current.x = event.clientX;
              swipe.current.y = event.clientY;
              const box = stageRef.current?.getBoundingClientRect() ?? {
                width: 0,
                height: 0,
              };
              setZoom((current) =>
                clampPreviewPan(
                  current.x + dx,
                  current.y + dy,
                  current.scale,
                  box,
                  photo.width,
                  photo.height,
                ),
              );
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                className="absolute inset-0 size-full object-contain"
                style={{
                  transform: previewZoomTransform(zoom.scale, zoom.x, zoom.y),
                  transition:
                    zoom.scale === 1
                      ? `transform ${PREVIEW_ZOOM_MS}ms`
                      : undefined,
                }}
              />
            ) : null}
            {photos.length > 1 && index !== null ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-lightbox-nav=""
                  className="absolute top-1/2 left-3 -translate-y-1/2"
                  onClick={() =>
                    onIndexChange(wrapIndex(index, -1, photos.length))
                  }
                >
                  {copy.galleryPrevious}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-lightbox-nav=""
                  className="absolute top-1/2 right-3 -translate-y-1/2"
                  onClick={() =>
                    onIndexChange(wrapIndex(index, 1, photos.length))
                  }
                >
                  {copy.galleryNext}
                </Button>
              </>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
