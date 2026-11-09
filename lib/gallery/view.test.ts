import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampPreviewPan,
  containedMediaRectFromBox,
  isPreviewZoomPointer,
  lightboxKeyAction,
  lightboxNeededLongEdge,
  lightboxPickedVariant,
  lightboxPreviewTapAction,
  lightboxShouldDismiss,
  lightboxTapOnPicture,
  lightboxViewport,
  neighborIndexes,
  pickLightboxVariant,
  pointInRect,
  previewZoomFromTap,
  previewZoomTransform,
  swipeDecision,
  wrapIndex,
} from "@/lib/gallery/view";

function imgTarget(opts: {
  naturalWidth?: number;
  naturalHeight?: number;
  box?: { left: number; top: number; width: number; height: number };
  control?: boolean;
}) {
  const box = opts.box ?? { left: 10, top: 10, width: 100, height: 80 };
  const node = {
    closest(sel: string) {
      if (opts.control && sel.includes("data-lightbox-nav")) return node;
      if (sel === "img") return node;
      return null;
    },
    getBoundingClientRect: () => ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
    }),
    naturalWidth: opts.naturalWidth ?? 200,
    naturalHeight: opts.naturalHeight ?? 160,
  };
  return node;
}

describe("lightbox variant picking", () => {
  it("picks the smallest ready size that covers the long edge", () => {
    expect(lightboxNeededLongEdge(100, 50, 2, 400, 200)).toBe(200);
    expect(lightboxNeededLongEdge(0, 0, 0, 0, 0)).toBe(1);
    expect(
      pickLightboxVariant(500, {
        thumb: true,
        hd: true,
        fhd: false,
        uhd: false,
      }),
    ).toBe("hd");
    expect(
      pickLightboxVariant(4000, {
        thumb: true,
        hd: false,
        fhd: false,
        uhd: false,
      }),
    ).toBe("thumb");
    expect(
      pickLightboxVariant(100, {
        thumb: false,
        hd: false,
        fhd: false,
        uhd: false,
      }),
    ).toBe("");
    expect(
      pickLightboxVariant(Number.NaN, {
        thumb: true,
        hd: false,
        fhd: false,
        uhd: false,
      }),
    ).toBe("thumb");
    expect(
      lightboxPickedVariant(
        {
          id: "a",
          width: 400,
          height: 200,
          variants: { thumb: true, hd: true, fhd: false, uhd: false },
        },
        { width: 100, height: 50, dpr: 2, zoom: 3 },
      ),
    ).toBe("hd");
  });
});

describe("lightbox viewport and geometry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the stage, then the window", () => {
    expect(
      lightboxViewport({ clientWidth: 320, clientHeight: 200 }),
    ).toEqual({ width: 320, height: 200, dpr: 1 });
    vi.stubGlobal("window", {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 2,
    });
    expect(lightboxViewport(null)).toEqual({
      width: 800,
      height: 600,
      dpr: 2,
    });
    vi.stubGlobal("window", {
      innerWidth: 0,
      innerHeight: 0,
      devicePixelRatio: 0,
    });
    expect(lightboxViewport({ clientWidth: 0, clientHeight: 0 })).toEqual({
      width: 0,
      height: 0,
      dpr: 1,
    });
  });

  it("fits a contained media rect and hit-tests it", () => {
    const rect = containedMediaRectFromBox(
      { left: 10, top: 10, width: 100, height: 80 },
      200,
      100,
    );
    expect(rect.left).toBe(10);
    expect(rect.top).toBe(25);
    expect(pointInRect(15, 25, rect)).toBe(true);
    expect(pointInRect(0, 0, rect)).toBe(false);
    expect(pointInRect(0, 0, null)).toBe(false);
    expect(
      containedMediaRectFromBox({ left: 1, top: 2, width: 0, height: 10 }, 1, 1),
    ).toEqual({ left: 1, top: 2, right: 1, bottom: 12 });
    expect(
      containedMediaRectFromBox(
        { left: Number.NaN, top: Number.NaN, width: Number.NaN, height: Number.NaN },
        Number.NaN,
        Number.NaN,
      ),
    ).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});

describe("lightbox gestures", () => {
  it("ignores taps on controls", () => {
    const event = {
      target: imgTarget({ control: true }),
      clientX: 50,
      clientY: 50,
    };
    expect(lightboxShouldDismiss(event)).toBe(false);
    expect(lightboxTapOnPicture(event)).toBe(false);
    expect(lightboxPreviewTapAction(event, { pointerType: "touch" })).toBe(
      "none",
    );
  });

  it("zooms on a touch tap on the picture and dismisses outside it", () => {
    const img = imgTarget({});
    const letterboxed = imgTarget({
      naturalWidth: 200,
      naturalHeight: 50,
    });
    const onPicture = { target: img, clientX: 60, clientY: 50 };
    const offPicture = { target: letterboxed, clientX: 12, clientY: 15 };
    expect(lightboxTapOnPicture(onPicture)).toBe(true);
    expect(lightboxPreviewTapAction(onPicture, { pointerType: "touch" })).toBe(
      "zoom-in",
    );
    expect(lightboxPreviewTapAction(onPicture, { pointerType: "mouse" })).toBe(
      "none",
    );
    expect(
      lightboxPreviewTapAction(onPicture, {
        pointerType: "touch",
        zoomed: true,
      }),
    ).toBe("zoom-out");
    expect(
      lightboxPreviewTapAction(onPicture, {
        pointerType: "mouse",
        zoomed: true,
      }),
    ).toBe("dismiss");
    expect(lightboxShouldDismiss(offPicture)).toBe(true);
    expect(lightboxPreviewTapAction(offPicture, {})).toBe("dismiss");
    expect(
      lightboxPreviewTapAction(
        {
          target: imgTarget({ naturalWidth: 0, naturalHeight: 0 }),
          clientX: 60,
          clientY: 50,
        },
        {},
      ),
    ).toBe("none");
    expect(
      lightboxTapOnPicture({
        target: imgTarget({ naturalWidth: 0, naturalHeight: 0 }),
        clientX: 60,
        clientY: 50,
      }),
    ).toBe(false);
    expect(
      lightboxShouldDismiss({
        target: imgTarget({ naturalWidth: 0 }),
        clientX: 0,
        clientY: 0,
      }),
    ).toBe(false);
    expect(
      lightboxShouldDismiss({ target: { closest: undefined }, clientX: 1, clientY: 1 }),
    ).toBe(true);
    expect(
      lightboxTapOnPicture({ target: { closest: undefined }, clientX: 1, clientY: 1 }),
    ).toBe(false);
    expect(isPreviewZoomPointer("touch")).toBe(true);
    expect(isPreviewZoomPointer("mouse")).toBe(false);
  });

  it("maps keys, swipes, pan, and zoom transforms", () => {
    expect(lightboxKeyAction({})).toBe("");
    expect(lightboxKeyAction({ key: "Escape" }, { hidden: true })).toBe("");
    const input = { closest: (sel: string) => (sel.includes("input") ? {} : null) };
    expect(lightboxKeyAction({ key: "Escape", target: input })).toBe("");
    expect(lightboxKeyAction({ key: "Escape" })).toBe("close");
    expect(lightboxKeyAction({ key: "ArrowLeft" })).toBe("prev");
    expect(lightboxKeyAction({ key: "ArrowRight" })).toBe("next");
    expect(lightboxKeyAction({ key: "a" })).toBe("");
    expect(swipeDecision(-60, 0)).toBe(1);
    expect(swipeDecision(60, 0)).toBe(-1);
    expect(swipeDecision(10, 0)).toBe(0);
    expect(swipeDecision(-80, 90)).toBe(0);
    expect(clampPreviewPan(500, 500, 2, { width: 100, height: 80 }, 200, 160)).toEqual(
      { scale: 2, x: 50, y: 40 },
    );
    expect(clampPreviewPan(0, 0, 1, { width: 0, height: 0 }, 0, 0)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    expect(clampPreviewPan(Number.NaN, Number.NaN, 0, { width: Number.NaN, height: Number.NaN }, 0, 0)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    const zoomed = previewZoomFromTap(
      60,
      50,
      { left: 10, top: 10, width: 100, height: 80 },
      200,
      160,
    );
    expect(zoomed.scale).toBe(2);
    expect(
      previewZoomFromTap(
        Number.NaN,
        Number.NaN,
        { left: Number.NaN, top: Number.NaN, width: Number.NaN, height: Number.NaN },
        0,
        0,
        0,
      ).scale,
    ).toBe(2);
    expect(previewZoomTransform(1, 0, 0)).toBe("");
    expect(previewZoomTransform(Number.NaN, Number.NaN, Number.NaN)).toBe("");
    expect(previewZoomTransform(2, 3, 4)).toBe("translate3d(3px,4px,0) scale(2)");
    expect(neighborIndexes(1, 3)).toEqual({ prev: 0, next: 2 });
    expect(neighborIndexes(0, 0)).toEqual({ prev: null, next: null });
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });
});
