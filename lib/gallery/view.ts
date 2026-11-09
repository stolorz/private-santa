import type { PhotoVariantName } from "@/lib/db/schema";
import { GALLERY_VARIANT_SPECS } from "@/lib/gallery/constants";

export type ReadyVariants = Record<PhotoVariantName, boolean>;

export const PREVIEW_ZOOM_SCALE = 2;
export const PREVIEW_ZOOM_MS = 180;
export const SWIPE_THRESHOLD_PX = 50;
export const SWIPE_SLOP_PX = 8;

const LIGHTBOX_CONTROL_HIT = "[data-lightbox-nav], a, button";

const LIGHTBOX_SIZES: Array<{ name: PhotoVariantName; size: number }> =
  GALLERY_VARIANT_SPECS.map((spec) => ({ name: spec.name, size: spec.size }));

export function isPreviewZoomPointer(pointerType: string | undefined): boolean {
  return pointerType === "touch";
}

export function lightboxNeededLongEdge(
  boxW: number,
  boxH: number,
  dpr: number,
  imgW: number,
  imgH: number,
): number {
  const w = Math.max(1, Number(boxW) || 0);
  const h = Math.max(1, Number(boxH) || 0);
  const ratio = Number(dpr) > 0 ? Number(dpr) : 1;
  const iw = Number(imgW) || 0;
  const ih = Number(imgH) || 0;
  let cssLong = w;
  if (iw > 0 && ih > 0) {
    const scale = Math.min(w / iw, h / ih);
    cssLong = Math.max(iw * scale, ih * scale);
  }
  return Math.ceil(cssLong * ratio);
}

export function pickLightboxVariant(
  need: number,
  ready: ReadyVariants,
): PhotoVariantName | "" {
  const want = Number(need) || 0;
  let largest: PhotoVariantName | "" = "";
  for (const spec of LIGHTBOX_SIZES) {
    if (!ready[spec.name]) continue;
    largest = spec.name;
    if (spec.size >= want) return spec.name;
  }
  return largest;
}

export function lightboxViewport(stage: {
  clientWidth?: number;
  clientHeight?: number;
} | null): { width: number; height: number; dpr: number } {
  let width = stage?.clientWidth ?? 0;
  let height = stage?.clientHeight ?? 0;
  if ((!width || !height) && typeof window !== "undefined") {
    width = window.innerWidth || width;
    height = window.innerHeight || height;
  }
  const dpr =
    typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1;
  return { width, height, dpr };
}

export function containedMediaRectFromBox(
  box: { left: number; top: number; width: number; height: number },
  mediaW: number,
  mediaH: number,
): { left: number; top: number; right: number; bottom: number } {
  const boxL = Number(box.left) || 0;
  const boxT = Number(box.top) || 0;
  const boxW = Math.max(0, Number(box.width) || 0);
  const boxH = Math.max(0, Number(box.height) || 0);
  const iw = Number(mediaW) || 0;
  const ih = Number(mediaH) || 0;
  if (!boxW || !boxH || !iw || !ih) {
    return { left: boxL, top: boxT, right: boxL + boxW, bottom: boxT + boxH };
  }
  const scale = Math.min(boxW / iw, boxH / ih);
  const w = iw * scale;
  const h = ih * scale;
  const left = boxL + (boxW - w) / 2;
  const top = boxT + (boxH - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

export function pointInRect(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number } | null,
  slop = 0,
): boolean {
  if (!rect) return false;
  const pad = Number(slop) || 0;
  return (
    x >= rect.left - pad &&
    x <= rect.right + pad &&
    y >= rect.top - pad &&
    y <= rect.bottom + pad
  );
}

function closest(target: unknown, selector: string): Element | null {
  if (!target || typeof (target as Element).closest !== "function") {
    return null;
  }
  return (target as Element).closest(selector);
}

export function lightboxShouldDismiss(event: {
  target: unknown;
  clientX: number;
  clientY: number;
}): boolean {
  if (closest(event.target, LIGHTBOX_CONTROL_HIT)) return false;
  const img = closest(event.target, "img") as HTMLImageElement | null;
  if (img) {
    const w = Number(img.naturalWidth) || 0;
    const h = Number(img.naturalHeight) || 0;
    if (!w || !h) return false;
    return !pointInRect(
      event.clientX,
      event.clientY,
      containedMediaRectFromBox(img.getBoundingClientRect(), w, h),
      2,
    );
  }
  return true;
}

export function lightboxTapOnPicture(event: {
  target: unknown;
  clientX: number;
  clientY: number;
}): boolean {
  if (closest(event.target, LIGHTBOX_CONTROL_HIT)) return false;
  const img = closest(event.target, "img") as HTMLImageElement | null;
  if (!img) return false;
  const w = Number(img.naturalWidth) || 0;
  const h = Number(img.naturalHeight) || 0;
  if (!w || !h) return false;
  return pointInRect(
    event.clientX,
    event.clientY,
    containedMediaRectFromBox(img.getBoundingClientRect(), w, h),
    2,
  );
}

export function lightboxPreviewTapAction(
  event: {
    target: unknown;
    clientX: number;
    clientY: number;
  },
  opts: { pointerType?: string; zoomed?: boolean },
): "none" | "zoom-in" | "zoom-out" | "dismiss" {
  if (closest(event.target, LIGHTBOX_CONTROL_HIT)) return "none";
  const pointerType = opts.pointerType;
  const zoomed = !!opts.zoomed;
  if (zoomed) {
    return isPreviewZoomPointer(pointerType) ? "zoom-out" : "dismiss";
  }
  if (lightboxTapOnPicture(event)) {
    return isPreviewZoomPointer(pointerType) ? "zoom-in" : "none";
  }
  if (lightboxShouldDismiss(event)) return "dismiss";
  return "none";
}

export function lightboxKeyAction(
  event: { key?: string; target?: unknown },
  opts: { hidden?: boolean } = {},
): "" | "close" | "prev" | "next" {
  if (!event?.key) return "";
  if (opts.hidden) return "";
  if (closest(event.target ?? null, "input, textarea, select, [contenteditable='true']")) {
    return "";
  }
  if (event.key === "Escape") return "close";
  if (event.key === "ArrowLeft") return "prev";
  if (event.key === "ArrowRight") return "next";
  return "";
}

export function swipeDecision(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD_PX,
): -1 | 0 | 1 {
  const adx = Math.abs(Number(dx) || 0);
  const ady = Math.abs(Number(dy) || 0);
  if (adx < threshold || adx <= ady) return 0;
  return dx < 0 ? 1 : -1;
}

function fitSize(
  boxW: number,
  boxH: number,
  mediaW: number,
  mediaH: number,
): { w: number; h: number } {
  const w = Math.max(0, Number(boxW) || 0);
  const h = Math.max(0, Number(boxH) || 0);
  const mw = Number(mediaW) || 0;
  const mh = Number(mediaH) || 0;
  if (!w || !h || !mw || !mh) return { w, h };
  const scale = Math.min(w / mw, h / mh);
  return { w: mw * scale, h: mh * scale };
}

export function clampPreviewPan(
  x: number,
  y: number,
  scale: number,
  box: { width: number; height: number },
  mediaW: number,
  mediaH: number,
): { scale: number; x: number; y: number } {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const boxW = Math.max(0, Number(box.width) || 0);
  const boxH = Math.max(0, Number(box.height) || 0);
  const fit = fitSize(boxW, boxH, mediaW, mediaH);
  const maxX = Math.max(0, (fit.w * s - boxW) / 2);
  const maxY = Math.max(0, (fit.h * s - boxH) / 2);
  const nx = Number(x) || 0;
  const ny = Number(y) || 0;
  const cx = Math.min(maxX, Math.max(-maxX, nx));
  const cy = Math.min(maxY, Math.max(-maxY, ny));
  return {
    scale: s,
    x: cx === 0 ? 0 : cx,
    y: cy === 0 ? 0 : cy,
  };
}

export function previewZoomFromTap(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  mediaW: number,
  mediaH: number,
  scale = PREVIEW_ZOOM_SCALE,
): { scale: number; x: number; y: number } {
  const s = Number(scale) || PREVIEW_ZOOM_SCALE;
  const left = Number(box.left) || 0;
  const top = Number(box.top) || 0;
  const width = Math.max(0, Number(box.width) || 0);
  const height = Math.max(0, Number(box.height) || 0);
  const cx = left + width / 2;
  const cy = top + height / 2;
  return clampPreviewPan(
    (1 - s) * ((Number(clientX) || 0) - cx),
    (1 - s) * ((Number(clientY) || 0) - cy),
    s,
    { width, height },
    mediaW,
    mediaH,
  );
}

export function previewZoomTransform(
  scale: number,
  x: number,
  y: number,
): string {
  const s = Number(scale) || 1;
  const tx = Number(x) || 0;
  const ty = Number(y) || 0;
  if (s === 1 && tx === 0 && ty === 0) return "";
  return `translate3d(${tx}px,${ty}px,0) scale(${s})`;
}

export function neighborIndexes(
  index: number,
  length: number,
): { prev: number | null; next: number | null } {
  if (length <= 0 || index < 0 || index >= length) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? index - 1 : null,
    next: index < length - 1 ? index + 1 : null,
  };
}

export function wrapIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (index + delta + length) % length;
}

export type LightboxPhoto = {
  id: string;
  width: number;
  height: number;
  variants: ReadyVariants;
};

export function lightboxPickedVariant(
  photo: LightboxPhoto,
  viewport: { width: number; height: number; dpr: number; zoom?: number },
): PhotoVariantName | "" {
  const zoom = Number(viewport.zoom) > 1 ? Number(viewport.zoom) : 1;
  const need = Math.ceil(
    lightboxNeededLongEdge(
      viewport.width,
      viewport.height,
      viewport.dpr,
      photo.width,
      photo.height,
    ) * zoom,
  );
  return pickLightboxVariant(need, photo.variants);
}
