/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationsView } from "@/lib/integrations-types";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { WhatsAppForm } from "@/components/settings/integrations/whatsapp-form";

function view(
  wa: Partial<IntegrationsView["whatsapp"]> = {},
): IntegrationsView {
  return {
    whatsapp: {
      configured: false,
      tokenSet: false,
      phoneId: "",
      template: "amigo_secreto",
      language: "pt_PT",
      source: "none",
      ...wa,
    },
    email: {
      configured: false,
      passwordSet: false,
      host: "",
      port: "587",
      user: "",
      from: "",
      imapHost: "",
      imapPort: "993",
      source: "none",
      testTo: "",
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

describe("WhatsAppForm", () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it("saves WhatsApp settings", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const saved = view({
      configured: true,
      tokenSet: true,
      phoneId: "123",
      source: "db",
    });
    requestJson.mockResolvedValue({
      ok: true,
      data: saved,
      error: null,
      status: 200,
    });
    render(<WhatsAppForm view={view()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /WhatsApp/ }));
    await user.type(screen.getByLabelText("Phone number ID"), "123");
    await user.click(screen.getByRole("button", { name: "Save WhatsApp" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });
});
