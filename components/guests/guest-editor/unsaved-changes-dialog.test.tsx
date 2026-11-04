/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "@/components/guests/guest-editor/unsaved-changes-dialog";
import { usePendingLeave } from "@/components/guests/guest-editor/use-pending-leave";

function LeaveHarness({ dirty = true }: { dirty?: boolean }) {
  const leave = usePendingLeave();
  const [left, setLeft] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => leave.tryLeave(dirty, () => setLeft(true))}>
        Leave
      </button>
      <button type="button" onClick={() => leave.clear()}>
        Clear
      </button>
      <form
        id="guest-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      />
      {left ? <p>left</p> : null}
      {saved ? <p>saved</p> : null}
      <UnsavedChangesDialog
        open={leave.open}
        onStay={leave.stay}
        onDiscard={() => leave.take()?.()}
        onSave={() => leave.submitForm("guest-form")}
      />
    </div>
  );
}

describe("unsaved leave", () => {
  it("leaves immediately when the form is clean", async () => {
    const user = userEvent.setup();
    render(<LeaveHarness dirty={false} />);
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByText("left")).toBeTruthy();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("asks to stay, discard, or save when dirty", async () => {
    const user = userEvent.setup();
    render(<LeaveHarness />);

    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByText("left")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Leave" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByText("left")).toBeTruthy();
  });

  it("submits the guest form from Save", async () => {
    const user = userEvent.setup();
    render(<LeaveHarness />);
    await user.click(screen.getByRole("button", { name: "Leave" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("saved")).toBeTruthy();
  });

  it("does not call onStay while busy", async () => {
    const onStay = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        busy
        onStay={onStay}
        onDiscard={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Stay" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
