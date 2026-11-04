/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IntegrationSection } from "@/components/settings/integrations/integration-section";

describe("IntegrationSection", () => {
  it("shows a configured badge and expands to reveal children", async () => {
    const user = userEvent.setup();
    render(
      <IntegrationSection title="Email" description="SMTP mailbox." configured>
        <p>Body</p>
      </IntegrationSection>,
    );
    expect(screen.getByText("enabled")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Email/ }));
    expect(screen.getByText("Body")).toBeTruthy();
  });
});
