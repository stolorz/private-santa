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

import { PushForm } from "@/components/settings/integrations/push-form";

function view(
  push: Partial<IntegrationsView["push"]> = {},
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
      subject: "mailto:ada@example.com",
      source: "none",
      ...push,
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

describe("PushForm", () => {
  it("generates VAPID keys", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const next = view({
      configured: true,
      publicKey: "Bxxx",
      source: "db",
    });
    requestJson.mockResolvedValue({
      ok: true,
      data: next,
      error: null,
      status: 200,
    });
    render(<PushForm view={view()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /Push/ }));
    await user.click(screen.getByRole("button", { name: "Generate keys" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(next));
  });
});
