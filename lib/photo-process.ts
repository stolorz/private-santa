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
