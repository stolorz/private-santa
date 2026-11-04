/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  guestRowClass,
  SharedContactDialog,
  SharedContactMark,
} from "@/components/guests/shared-contact";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SharedContactIssue } from "@/lib/guest-contact";

const issues: SharedContactIssue[] = [
  {
    field: "email",
    stored: "ada@example.com",
    label: "ada@example.com",
    names: ["Bea"],
  },
];

describe("guestRowClass", () => {
  it("adds a warning class when there are issues", () => {
    expect(guestRowClass([])).not.toContain("border-amber");
    expect(guestRowClass(issues)).toContain("border-amber");
  });
});

describe("SharedContactMark", () => {
  it("renders nothing without issues", () => {
    const { container } = render(
      <TooltipProvider>
        <SharedContactMark issues={[]} />
      </TooltipProvider>,
    );
    expect(container.querySelector("[role='img']")).toBeNull();
  });

  it("exposes a warning label when contacts are shared", () => {
    render(
      <TooltipProvider>
        <SharedContactMark issues={issues} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("img")).toBeTruthy();
  });
});

describe("SharedContactDialog", () => {
  it("confirms saving a shared contact", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <SharedContactDialog
        issues={issues}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save anyway" }));
    expect(onConfirm).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
