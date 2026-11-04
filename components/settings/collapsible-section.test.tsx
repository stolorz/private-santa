/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CollapsibleSection } from "@/components/settings/collapsible-section";

function panelFor(header: HTMLElement) {
  const id = header.getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}

describe("CollapsibleSection", () => {
  it("starts collapsed and keeps children in the document", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Email" description="Sent to guests.">
        <label htmlFor="subject">Subject</label>
        <input id="subject" defaultValue="keep me" />
      </CollapsibleSection>,
    );

    const header = screen.getByRole("button", { name: /Email/ });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(panelFor(header)?.hidden).toBe(true);
    expect(screen.getByLabelText("Subject")).toHaveProperty("value", "keep me");

    await user.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(panelFor(header)?.hidden).toBe(false);

    await user.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(panelFor(header)?.hidden).toBe(true);
    expect(screen.getByLabelText("Subject")).toHaveProperty("value", "keep me");
  });

  it("stays expanded while forceOpen is set", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection
        title="Reveal page"
        description="Shown to guests."
        forceOpen
      >
        <p>Empty copy</p>
      </CollapsibleSection>,
    );

    const header = screen.getByRole("button", { name: /Reveal page/ });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(panelFor(header)?.hidden).toBe(false);

    await user.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(panelFor(header)?.hidden).toBe(false);
  });

  it("renders optional trailing content in the header", () => {
    render(
      <CollapsibleSection
        title="Email"
        description="Sent to guests."
        trailing={<span>enabled</span>}
      >
        <p>Body</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: /Email/ }).textContent).toContain(
      "enabled",
    );
  });
});
