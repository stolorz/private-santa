/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GuestFields } from "@/components/guests/guest-editor/guest-fields";
import { useGuestDraft } from "@/components/guests/guest-editor/use-guest-draft";

function FieldsHost({ contactDisabled = false }: { contactDisabled?: boolean }) {
  const draft = useGuestDraft();
  return (
    <GuestFields
      idPrefix="guest"
      draft={draft}
      contactDisabled={contactDisabled}
    />
  );
}

describe("GuestFields", () => {
  it("edits the name on the draft", async () => {
    const user = userEvent.setup();
    render(<FieldsHost />);
    await user.type(screen.getByLabelText("Name"), "Ada");
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Ada");
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("keeps the six Polish cases required and editable when contact is locked", () => {
    render(<FieldsHost contactDisabled />);
    for (const label of [
      "Dopełniacz",
      "Celownik",
      "Biernik",
      "Narzędnik",
      "Miejscownik",
      "Wołacz",
    ]) {
      const field = screen.getByLabelText(new RegExp(label));
      expect(field).toHaveProperty("required", true);
      expect(field).toHaveProperty("disabled", false);
    }
    expect(screen.getByPlaceholderText("Phone")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Email")).toHaveProperty("disabled", true);
  });
});
