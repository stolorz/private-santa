"use client";

import { useCallback, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clampCropRect,
  PHOTO_MAX_EDGE,
  scaleToMaxEdge,
} from "@/lib/photo-process";

const PHOTO_ZOOM_MIN = 1;
const PHOTO_ZOOM_MAX = 6;
const PHOTO_ZOOM_BUTTON_STEP = 0.25;

function clampZoom(value: number): number {
  const clamped = Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, value));
  return Math.round(clamped * 100) / 100;
}

function insetCropSize(
  stageWidth: number,
  stageHeight: number,
): { width: number; height: number } | null {
  const shorter = Math.min(stageWidth, stageHeight);
  if (shorter <= 0) return null;
  const size = Math.max(1, Math.round(shorter * 0.7));
  return { width: size, height: size };
}

export function PhotoCropper({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(PHOTO_ZOOM_MIN);
  const [cropSize, setCropSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageObserver = useRef<ResizeObserver | null>(null);
  const pixelsRef = useRef<Area | null>(null);
  const cancelledRef = useRef(false);

  const measureStage = useCallback((stage: HTMLDivElement | null) => {
    stageObserver.current?.disconnect();
    stageObserver.current = null;
    if (!stage) return;
    const apply = () => {
      const next = insetCropSize(stage.clientWidth, stage.clientHeight);
      setCropSize((prev) => {
        if (!next) return prev;
        if (prev && prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        return next;
      });
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(stage);
    stageObserver.current = observer;
  }, []);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    pixelsRef.current = pixels;
  }, []);

  function cancel() {
    cancelledRef.current = true;
    onCancel();
  }

  function resetFraming() {
    setCrop({ x: 0, y: 0 });
    setZoom(PHOTO_ZOOM_MIN);
  }

  async function usePhoto() {
    const area = pixelsRef.current;
    if (!area || busy) return;
    setBusy(true);
    setError(null);
    try {
      const file = await cropToJpeg(src, area);
      if (cancelledRef.current) return;
      onConfirm(file);
    } catch {
      if (cancelledRef.current) return;
      setError("Could not process the photo.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent
        className="flex h-[min(90vh,40rem)] max-h-[min(90vh,40rem)] w-[min(96vw,36rem)] max-w-none flex-col overflow-hidden p-4 sm:p-6"
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Adjust photo</DialogTitle>
          <DialogDescription>
            Drag the photo and zoom to frame the part you want inside the
            circle. It will be saved as a square at up to {PHOTO_MAX_EDGE}px.
          </DialogDescription>
        </DialogHeader>
        <div
          ref={measureStage}
          className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-muted"
        >
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={PHOTO_ZOOM_MIN}
            maxZoom={PHOTO_ZOOM_MAX}
            aspect={1}
            cropShape="round"
            cropSize={cropSize ?? undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            onClick={() =>
              setZoom((current) => clampZoom(current - PHOTO_ZOOM_BUTTON_STEP))
            }
            disabled={busy || zoom <= PHOTO_ZOOM_MIN}
          >
            <Minus />
          </Button>
          <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
            <span className="text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={PHOTO_ZOOM_MIN}
              max={PHOTO_ZOOM_MAX}
              step={0.05}
              value={zoom}
              aria-label="Zoom"
              disabled={busy}
              className="w-full"
              onChange={(e) => setZoom(clampZoom(Number(e.target.value)))}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() =>
              setZoom((current) => clampZoom(current + PHOTO_ZOOM_BUTTON_STEP))
            }
            disabled={busy || zoom >= PHOTO_ZOOM_MAX}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetFraming}
            disabled={busy}
          >
            Reset
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={usePhoto} disabled={busy}>
            {busy ? "Processing…" : "Use photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load photo."));
    image.src = src;
  });
}

async function cropToJpeg(src: string, area: Area): Promise<File> {
  const image = await loadImage(src);
  const rect = clampCropRect(area, image.naturalWidth, image.naturalHeight);
  const size = scaleToMaxEdge(rect.width, rect.height, PHOTO_MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop photo.");
  ctx.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    size.width,
    size.height,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Could not crop photo.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
