/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuestFormActions } from "@/components/guests/guest-editor/guest-form-actions";

describe("GuestFormActions", () => {
  it("cancels and disables save when asked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <form>
        <GuestFormActions saveDisabled onCancel={onCancel} />
      </form>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
