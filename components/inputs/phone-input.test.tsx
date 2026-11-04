/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhoneInput } from "@/components/inputs/phone-input";

describe("PhoneInput", () => {
  it("renders a telephone field", () => {
    render(<PhoneInput value="351912345678" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
