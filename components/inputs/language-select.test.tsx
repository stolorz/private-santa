/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageSelect } from "@/components/inputs/language-select";

describe("LanguageSelect", () => {
  it("renders the language combobox for the current value", () => {
    render(<LanguageSelect value="en" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Language" })).toBeTruthy();
  });
});
