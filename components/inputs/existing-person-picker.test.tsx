/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ExistingPersonPicker } from "@/components/inputs/existing-person-picker";
import { makePerson } from "@/test/helpers/fixtures";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ExistingPersonPicker", () => {
  it("selects an existing person from the list", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const ada = makePerson({ id: 1, name: "Ada" });
    render(
      <ExistingPersonPicker
        people={[ada, makePerson({ id: 2, name: "Bea" })]}
        selectedId={null}
        onSelect={onSelect}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Existing person" }));
    await user.click(screen.getByRole("option", { name: /Ada/ }));
    expect(onSelect).toHaveBeenCalledWith(ada);
  });

  it("clears the selected person", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <ExistingPersonPicker
        people={[makePerson({ id: 1, name: "Ada" })]}
        selectedId={1}
        onSelect={vi.fn()}
        onClear={onClear}
      />,
    );
    expect(screen.getByText("Ada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create new instead" }));
    expect(onClear).toHaveBeenCalled();
  });
});
