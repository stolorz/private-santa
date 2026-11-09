/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoLightbox } from "@/components/reveal/photo-lightbox";
import { readyPhotoView } from "@/test/helpers/gallery";

const COPY = {
  galleryClose: "Close",
  galleryDownload: "Download original",
  galleryPrevious: "Previous photo",
  galleryNext: "Next photo",
};

function photo(id: string) {
  return readyPhotoView({ id });
}

const PHOTOS = [photo("a".repeat(32)), photo("b".repeat(32))];

describe("PhotoLightbox", () => {
  it("does not render a dialog when closed", () => {
    render(
      <PhotoLightbox
        token="tok"
        photos={PHOTOS}
        index={null}
        onIndexChange={vi.fn()}
        copy={COPY}
      />,
    );
    expect(screen.queryByText("Close")).toBeNull();
  });

  it("navigates with buttons, keys, swipe, and zoom", async () => {
    const user = userEvent.setup();
    const onIndexChange = vi.fn();
    class FakeImage {
      decoding = "async";
      src = "";
      decode() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const { rerender } = render(
      <PhotoLightbox
        token="tok"
        photos={PHOTOS}
        index={0}
        onIndexChange={onIndexChange}
        copy={COPY}
      />,
    );
    expect(screen.getByRole("link", { name: "Download original" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next photo" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onIndexChange).toHaveBeenCalledWith(null);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onIndexChange).toHaveBeenCalledWith(null);
    fireEvent.keyDown(window, { key: "a" });

    const stage = document.querySelector("[data-lightbox-stage]") as HTMLElement;
    Object.defineProperty(stage, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }),
    });
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 150, pointerType: "touch" });
    fireEvent.pointerUp(stage, { clientX: 120, clientY: 150, pointerType: "touch" });
    expect(onIndexChange).toHaveBeenCalledWith(1);

    const img = stage.querySelector("img") as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 150, pointerType: "touch" });
    fireEvent.pointerUp(img, { clientX: 200, clientY: 150, pointerType: "touch" });

    rerender(
      <PhotoLightbox
        token="tok"
        photos={PHOTOS}
        index={0}
        onIndexChange={onIndexChange}
        copy={COPY}
      />,
    );
    fireEvent.pointerDown(stage, { clientX: 10, clientY: 10, pointerType: "mouse" });
    fireEvent.pointerMove(stage, { clientX: 20, clientY: 20, pointerType: "mouse" });
    fireEvent.pointerUp(stage, { clientX: 12, clientY: 12, pointerType: "mouse" });

    vi.unstubAllGlobals();
  });
});
