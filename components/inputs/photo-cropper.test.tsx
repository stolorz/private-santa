/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CropPoint = { x: number; y: number };
type CropArea = CropPoint & { width: number; height: number };

type MockCropperProps = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  cropShape: string;
  crop: CropPoint;
  cropSize?: { width: number; height: number };
  onCropChange: (crop: CropPoint) => void;
  onCropComplete?: (area: CropArea, pixels: CropArea) => void;
};

const cropperSpy = vi.hoisted(() => ({
  props: null as MockCropperProps | null,
}));

vi.mock("react-easy-crop", () => ({
  default: (props: MockCropperProps) => {
    cropperSpy.props = props;
    props.onCropComplete?.(
      { x: 0, y: 0, width: 50, height: 50 },
      { x: -4, y: 30, width: 100, height: 80 },
    );
    return <div>cropper</div>;
  },
}));

import { PhotoCropper } from "@/components/inputs/photo-cropper";

const drawImage = vi.fn();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

class StubImage {
  naturalWidth = 50;
  naturalHeight = 40;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_src: string) {
    this.onload?.();
  }
}

function stubCanvas(blob: Blob | null) {
  HTMLCanvasElement.prototype.getContext = vi.fn(() =>
    blob ? ({ drawImage } as unknown as CanvasRenderingContext2D) : null,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = ((callback: (blob: Blob | null) => void) => {
    callback(blob);
  }) as typeof HTMLCanvasElement.prototype.toBlob;
}

beforeEach(() => {
  cropperSpy.props = null;
  drawImage.mockClear();
  vi.stubGlobal("Image", StubImage);
  stubCanvas(new Blob(["jpeg"], { type: "image/jpeg" }));
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
  vi.unstubAllGlobals();
});

function renderCropper(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(<PhotoCropper src="blob:photo" onCancel={onCancel} onConfirm={onConfirm} />);
  return { onConfirm, onCancel };
}

describe("PhotoCropper", () => {
  it("cancels without confirming", async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderCropper();
    expect(screen.getByText("Adjust photo")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("zooms from the slider and buttons, then resets pan and zoom", async () => {
    const user = userEvent.setup();
    renderCropper();
    const slider = screen.getByRole("slider", { name: "Zoom" }) as HTMLInputElement;
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("6");
    expect(slider.step).toBe("0.05");
    expect(cropperSpy.props).toMatchObject({
      minZoom: 1,
      maxZoom: 6,
      cropShape: "round",
      zoom: 1,
    });
    expect(
      (screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(slider, { target: { value: "2.5" } });
    expect(cropperSpy.props?.zoom).toBe(2.5);

    fireEvent.change(slider, { target: { value: "1.1" } });
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(cropperSpy.props?.zoom).toBe(1);
    expect(
      (screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(cropperSpy.props?.zoom).toBe(1.25);

    fireEvent.change(slider, { target: { value: "5.9" } });
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(cropperSpy.props?.zoom).toBe(6);
    expect(
      (screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    act(() => {
      cropperSpy.props?.onCropChange({ x: 12, y: -4 });
    });
    expect(cropperSpy.props?.crop).toEqual({ x: 12, y: -4 });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(cropperSpy.props).toMatchObject({
      zoom: 1,
      crop: { x: 0, y: 0 },
    });
  });

  it("insets the round frame to 70% of the shorter stage edge", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    renderCropper();
    expect(cropperSpy.props?.cropSize).toEqual({ width: 70, height: 70 });
  });

  it("confirms a jpeg of the clamped frame", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderCropper();
    await user.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const file = onConfirm.mock.calls[0]?.[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("photo.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(StubImage),
      0,
      30,
      50,
      10,
      0,
      0,
      50,
      10,
    );
  });

  it("shows an error when the photo cannot be processed", async () => {
    const user = userEvent.setup();
    stubCanvas(null);
    const { onConfirm } = renderCropper();
    await user.click(screen.getByRole("button", { name: "Use photo" }));
    expect(await screen.findByText("Could not process the photo.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
