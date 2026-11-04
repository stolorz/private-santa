/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NameCaseInputs } from "@/components/inputs/name-case-inputs";
import { emptyNameCaseForm } from "@/lib/name-cases";

describe("NameCaseInputs", () => {
  it("edits a Polish case field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NameCaseInputs
        idPrefix="guest"
        values={emptyNameCaseForm()}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText(/Dopełniacz/)).toHaveProperty("required", true);
    expect(
      screen.getByLabelText(/Dopełniacz/).getAttribute("aria-invalid"),
    ).toBe("true");
    await user.type(screen.getByLabelText(/Dopełniacz/), "Ady");
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("nameDopelniacz");
  });

  it("leaves optional cases unmarked", () => {
    render(
      <NameCaseInputs
        idPrefix="event"
        required={false}
        values={emptyNameCaseForm()}
        onChange={vi.fn()}
      />,
    );
    const field = screen.getByLabelText(/Dopełniacz/);
    expect(field).toHaveProperty("required", false);
    expect(field.getAttribute("aria-invalid")).toBeNull();
  });
});
