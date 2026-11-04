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

import { SignalForm } from "@/components/settings/integrations/signal-form";

function view(
  signal: Partial<IntegrationsView["signal"]> = {},
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
      ...signal,
    },
  };
}

describe("SignalForm", () => {
  it("starts linking a device", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const next = view({ linking: true, preparing: true });
    requestJson.mockImplementation(async (url: unknown) => {
      if (String(url).includes("/contacts")) {
        return { ok: true, data: { contacts: [] }, error: null, status: 200 };
      }
      return { ok: true, data: next, error: null, status: 200 };
    });
    render(<SignalForm view={view()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /Signal/ }));
    await user.click(screen.getByRole("button", { name: "Link device" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(next));
  });
});
