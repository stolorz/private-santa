/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuestRow } from "@/components/guests/guest-editor/guest-row";

describe("GuestRow", () => {
  it("shows a missing-gender error on the collapsed row", () => {
    render(
      <ul>
        <GuestRow name="Ada" issues={[]} error="Gender is required." />
      </ul>,
    );
    expect(screen.getByText("Gender is required.")).toBeTruthy();
  });

  it("opens the guest when the name is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ul>
        <GuestRow name="Ada" issues={[]} summary="+351 91" onOpen={onOpen} />
      </ul>,
    );
    expect(screen.getByText("+351 91")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Ada/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("renders the editor slot while editing", () => {
    render(
      <ul>
        <GuestRow name="Ada" issues={[]} editing>
          <input aria-label="Name" defaultValue="Ada" />
        </GuestRow>
      </ul>,
    );
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Ada");
  });
});
