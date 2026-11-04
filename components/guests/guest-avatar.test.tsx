/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuestAvatar } from "@/components/guests/guest-avatar";

describe("GuestAvatar", () => {
  it("shows initials when there is no photo", () => {
    render(<GuestAvatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeTruthy();
  });

  it("shows a fallback mark for an empty name", () => {
    render(<GuestAvatar name="   " />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("opens the file picker when picking is enabled", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<GuestAvatar name="Ada" onPick={onPick} />);
    expect(
      screen.getByRole("button", { name: "Add photo of Ada" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add photo of Ada" }));
  });

  it("opens the cropper when a photo is chosen", async () => {
    const user = userEvent.setup();
    render(<GuestAvatar name="Ada" onPick={vi.fn()} />);
    const file = new File(["photo"], "ada.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload photo"), file);
    expect(screen.getByText("Adjust photo")).toBeTruthy();
  });
});
