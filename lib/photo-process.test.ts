import { describe, expect, it } from "vitest";
import { clampCropRect, PHOTO_MAX_EDGE, scaleToMaxEdge } from "./photo-process";

describe("clampCropRect", () => {
  it("rounds a rect that already sits inside the image", () => {
    expect(
      clampCropRect({ x: 10.2, y: 20.4, width: 30.2, height: 40.6 }, 200, 200),
    ).toEqual({ x: 10, y: 20, width: 30, height: 41 });
  });

  it("pulls an origin past the left or top edge back into the image", () => {
    expect(
      clampCropRect({ x: -10.2, y: -4.6, width: 30, height: 15 }, 100, 100),
    ).toEqual({ x: 0, y: 0, width: 30, height: 15 });
  });

  it("shrinks a rect that runs past the right or bottom edge", () => {
    expect(
      clampCropRect({ x: 70.2, y: 60.4, width: 50.6, height: 40.2 }, 100, 90),
    ).toEqual({ x: 70, y: 60, width: 30, height: 30 });
    expect(
      clampCropRect({ x: 99.6, y: 200, width: 40, height: 10 }, 100, 80),
    ).toEqual({ x: 99, y: 79, width: 1, height: 1 });
  });

  it("forces a degenerate area to a 1×1 pixel", () => {
    expect(
      clampCropRect({ x: 4.2, y: 5.1, width: 0.4, height: -3 }, 80, 80),
    ).toEqual({ x: 4, y: 5, width: 1, height: 1 });
  });
});

describe("scaleToMaxEdge", () => {
  it("scales a landscape image so the longer edge is 1200", () => {
    expect(scaleToMaxEdge(2400, 1800)).toEqual({ width: 1200, height: 900 });
  });

  it("scales a portrait image so the longer edge is 1200", () => {
    expect(scaleToMaxEdge(1000, 2000)).toEqual({ width: 600, height: 1200 });
  });

  it("does not upscale an image already within the limit", () => {
    expect(scaleToMaxEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("leaves a square at the max edge unchanged", () => {
    expect(scaleToMaxEdge(PHOTO_MAX_EDGE, PHOTO_MAX_EDGE)).toEqual({
      width: PHOTO_MAX_EDGE,
      height: PHOTO_MAX_EDGE,
    });
  });

  it("returns zeros for non-positive dimensions", () => {
    expect(scaleToMaxEdge(0, 100)).toEqual({ width: 0, height: 0 });
    expect(scaleToMaxEdge(100, -1)).toEqual({ width: 0, height: 0 });
  });
});
