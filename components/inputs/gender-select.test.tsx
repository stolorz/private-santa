/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GenderSelect } from "@/components/inputs/gender-select";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

describe("GenderSelect", () => {
  it("renders the gender combobox", () => {
    render(<GenderSelect value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Gender" })).toBeTruthy();
  });

  it("offers female and male and does not offer a way to clear the choice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GenderSelect value={null} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Gender" }));
    expect(screen.queryByRole("option", { name: "Gender" })).toBeNull();
    expect(screen.getByRole("option", { name: "Female" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Male" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Female" }));
    expect(onChange).toHaveBeenCalledWith("female");
  });
});
