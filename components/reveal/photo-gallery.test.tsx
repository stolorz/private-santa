/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PhotoGallery } from "@/components/reveal/photo-gallery";
import { readyPhotoView } from "@/test/helpers/gallery";

const COPY = {
  galleryBack: "Back",
  galleryClose: "Close",
  galleryDownload: "Download original",
  galleryPrevious: "Previous photo",
  galleryNext: "Next photo",
};

const PHOTO = readyPhotoView({ id: "a".repeat(32) });

describe("PhotoGallery", () => {
  it("renders a back link and opens a thumbnail", async () => {
    const user = userEvent.setup();
    render(
      <PhotoGallery token="tok123" photos={[PHOTO]} copy={COPY} />,
    );
    expect(screen.getByRole("link", { name: "Back" })).toHaveProperty(
      "href",
      expect.stringMatching(/\/tok123$/),
    );
    expect(screen.getByRole("list").className).toContain("lg:grid-cols-5");
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("link", { name: "Download original" })).toBeTruthy();
  });

  it("renders an empty grid without crashing", () => {
    render(
      <PhotoGallery token="tok123" photos={[]} copy={COPY} />,
    );
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
