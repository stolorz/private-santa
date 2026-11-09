import { describe, expect, it } from "vitest";
import { photoGridStatus, photosNeedPoll } from "@/lib/gallery/status";
import { allVariantStatus, photoView } from "@/test/helpers/gallery";

describe("photoGridStatus", () => {
  it("prefers failed when any variant errored", () => {
    expect(
      photoGridStatus(
        photoView({
          id: "a".repeat(32),
          variants: {
            ...allVariantStatus("done"),
            hd: { status: "error", error: "nope", bytes: null },
          },
        }),
      ),
    ).toBe("failed");
  });

  it("is ready once the thumbnail exists", () => {
    expect(
      photoGridStatus(photoView({ id: "a".repeat(32), thumb: "done" })),
    ).toBe("ready");
  });

  it("is processing otherwise", () => {
    expect(photoGridStatus(photoView({ id: "a".repeat(32) }))).toBe(
      "processing",
    );
  });
});

describe("photosNeedPoll", () => {
  it("is true while any variant is pending or running", () => {
    expect(photosNeedPoll([])).toBe(false);
    expect(
      photosNeedPoll([
        photoView({
          id: "a".repeat(32),
          variants: allVariantStatus("done"),
        }),
      ]),
    ).toBe(false);
    expect(
      photosNeedPoll([photoView({ id: "a".repeat(32), hd: "running" })]),
    ).toBe(true);
  });
});
