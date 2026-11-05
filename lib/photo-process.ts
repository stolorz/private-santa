export const PHOTO_MAX_EDGE = 1200;

export function clampCropRect(
  area: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(Math.round(area.x), imageWidth - 1));
  const y = Math.max(0, Math.min(Math.round(area.y), imageHeight - 1));
  const width = Math.max(1, Math.min(Math.round(area.width), imageWidth - x));
  const height = Math.max(
    1,
    Math.min(Math.round(area.height), imageHeight - y),
  );
  return { x, y, width, height };
}

/** Farthest zoom-out at which the crop circle still covers the photo. */
export function coverMinZoom(
  cropEdge: number,
  mediaWidth: number,
  mediaHeight: number,
): number {
  const shorter = Math.min(mediaWidth, mediaHeight);
  if (cropEdge <= 0 || shorter <= 0) return 1;
  return Math.round((cropEdge / shorter) * 100) / 100;
}

/**
 * Edge lengths for a halving downscale, ending at `destEdge`.
 * Empty when the source is already within the limit.
 */
export function downscalePyramid(srcEdge: number, destEdge: number): number[] {
  if (srcEdge <= destEdge || destEdge <= 0) return [];
  const steps: number[] = [];
  let current = srcEdge;
  while (Math.round(current / 2) > destEdge) {
    const next = Math.round(current / 2);
    if (next >= current) break;
    current = next;
    steps.push(current);
  }
  steps.push(destEdge);
  return steps;
}

export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longer = Math.max(width, height);
  if (longer <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longer;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
