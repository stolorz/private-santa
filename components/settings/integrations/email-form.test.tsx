/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { IntegrationsView } from "@/lib/integrations-types";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { EmailForm } from "@/components/settings/integrations/email-form";

function view(
  email: Partial<IntegrationsView["email"]> = {},
): IntegrationsView {
  return {
    whatsapp: {
      configured: false,
      tokenSet: false,
      phoneId: "",
      template: "amigo_secreto",
      language: "pt_PT",
      source: "none",
    },
    email: {
      configured: true,
      passwordSet: true,
      host: "smtp.test",
      port: "587",
      user: "santa@test",
      from: "santa@test",
      imapHost: "",
      imapPort: "993",
      source: "db",
      testTo: "ada@example.com",
      ...email,
    },
    push: {
      configured: false,
      publicKey: "",
      subject: "",
      source: "none",
    },
    signal: {
      configured: false,
      linking: false,
      preparing: false,
      linkUrl: null,
      qrDataUrl: null,
      error: null,
      accountNumber: null,
    },
  };
}

describe("EmailForm", () => {
  it("clears the mailbox config", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const cleared = view({
      configured: false,
      passwordSet: false,
      host: "",
      user: "",
      from: "",
      source: "none",
    });
    requestJson.mockResolvedValue({
      ok: true,
      data: cleared,
      error: null,
      status: 200,
    });
    render(<EmailForm view={view()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /Email/ }));
    expect(
      screen.getByText("Bounce reading stays off until an IMAP host is saved."),
    ).toBeTruthy();
    expect(screen.queryByText(/use the SMTP host/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(cleared));
  });
});
