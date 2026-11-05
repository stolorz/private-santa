"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  coverMinZoom,
  downscalePyramid,
  PHOTO_MAX_EDGE,
  scaleToMaxEdge,
} from "@/lib/photo-process";

const OPEN_ZOOM = 1;
const PHOTO_ZOOM_MAX = 6;
const PHOTO_ZOOM_BUTTON_STEP = 0.25;

function zoomCeiling(minZoom: number): number {
  return (
    Math.round(Math.max(PHOTO_ZOOM_MAX, minZoom * PHOTO_ZOOM_MAX) * 100) / 100
  );
}

function clampZoom(value: number, minZoom: number, maxZoom: number): number {
  const clamped = Math.min(maxZoom, Math.max(minZoom, value));
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
  const [zoom, setZoom] = useState(OPEN_ZOOM);
  const [cropSize, setCropSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [mediaSize, setMediaSize] = useState<{
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

  const rememberMediaSize = useCallback(
    (size: { width: number; height: number }) => {
      if (!(size.width > 0) || !(size.height > 0)) return;
      setMediaSize((prev) => {
        if (prev && prev.width === size.width && prev.height === size.height) {
          return prev;
        }
        return { width: size.width, height: size.height };
      });
    },
    [],
  );

  const minZoom =
    cropSize && mediaSize
      ? coverMinZoom(cropSize.width, mediaSize.width, mediaSize.height)
      : OPEN_ZOOM;
  const maxZoom = zoomCeiling(minZoom);

  useEffect(() => {
    setZoom((current) => clampZoom(current, minZoom, maxZoom));
  }, [minZoom, maxZoom]);

  function cancel() {
    cancelledRef.current = true;
    onCancel();
  }

  function resetFraming() {
    setCrop({ x: 0, y: 0 });
    setZoom(minZoom);
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
            minZoom={minZoom}
            maxZoom={maxZoom}
            aspect={1}
            cropShape="round"
            cropSize={cropSize ?? undefined}
            setMediaSize={rememberMediaSize}
            onCropChange={setCrop}
            onZoomChange={(value) => setZoom(clampZoom(value, minZoom, maxZoom))}
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
              setZoom((current) =>
                clampZoom(current - PHOTO_ZOOM_BUTTON_STEP, minZoom, maxZoom),
              )
            }
            disabled={busy || zoom <= minZoom}
          >
            <Minus />
          </Button>
          <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
            <span className="text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.05}
              value={zoom}
              aria-label="Zoom"
              disabled={busy}
              className="w-full"
              onChange={(e) =>
                setZoom(clampZoom(Number(e.target.value), minZoom, maxZoom))
              }
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() =>
              setZoom((current) =>
                clampZoom(current + PHOTO_ZOOM_BUTTON_STEP, minZoom, maxZoom),
              )
            }
            disabled={busy || zoom >= maxZoom}
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
  if (size.width < rect.width || size.height < rect.height) {
    const bitmap = await resizeCrop(image, rect, size);
    if (bitmap) {
      try {
        ctx.drawImage(bitmap, 0, 0);
      } finally {
        bitmap.close();
      }
    } else {
      paintPyramid(ctx, image, rect, size);
    }
  } else {
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
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Could not crop photo.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

type PixelRect = { x: number; y: number; width: number; height: number };
type PixelSize = { width: number; height: number };

async function resizeCrop(
  image: CanvasImageSource,
  rect: PixelRect,
  size: PixelSize,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      {
        resizeWidth: size.width,
        resizeHeight: size.height,
        resizeQuality: "high",
      },
    );
  } catch {
    return null;
  }
}

function paintSmooth(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
}

function paintPyramid(
  destCtx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  rect: PixelRect,
  size: PixelSize,
) {
  const steps = downscalePyramid(
    Math.max(rect.width, rect.height),
    Math.max(size.width, size.height),
  );
  const edges =
    steps.length > 0 ? steps : [Math.max(size.width, size.height)];
  let source: CanvasImageSource = image;
  let sx = rect.x;
  let sy = rect.y;
  let sw = rect.width;
  let sh = rect.height;
  for (const [index, edge] of edges.entries()) {
    const last = index === edges.length - 1;
    const scale = edge / Math.max(sw, sh);
    const dw = last ? size.width : Math.max(1, Math.round(sw * scale));
    const dh = last ? size.height : Math.max(1, Math.round(sh * scale));
    if (last) {
      paintSmooth(destCtx, source, sx, sy, sw, sh, dw, dh);
      return;
    }
    const target = document.createElement("canvas");
    target.width = dw;
    target.height = dh;
    const targetCtx = target.getContext("2d");
    if (!targetCtx) throw new Error("Could not crop photo.");
    paintSmooth(targetCtx, source, sx, sy, sw, sh, dw, dh);
    source = target;
    sx = 0;
    sy = 0;
    sw = target.width;
    sh = target.height;
  }
}
