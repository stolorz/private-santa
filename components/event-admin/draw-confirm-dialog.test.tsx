/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DrawConfirmDialog } from "@/components/event-admin/draw-confirm-dialog";

const givers = [
  { id: 1, name: "Ada", recipients: ["Bea"] },
  { id: 2, name: "Bea", recipients: [] },
];

describe("DrawConfirmDialog", () => {
  it("previews remaining pairs and continues", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    render(
      <DrawConfirmDialog
        open
        running={false}
        hasPairs
        avoidPastPairings
        givers={givers}
        onCancel={onCancel}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText("Draw remaining?")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("No possible recipients")).toBeTruthy();
    expect(
      screen.getByText(/avoid last year's pairings/i),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalled();
  });

  it("cancels when not running", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DrawConfirmDialog
        open
        running={false}
        hasPairs={false}
        avoidPastPairings={false}
        givers={[{ id: 1, name: "Ada", recipients: ["Bea"] }]}
        onCancel={onCancel}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText("Run the draw?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
