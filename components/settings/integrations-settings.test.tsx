/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationsView } from "@/lib/integrations-types";

const refresh = vi.fn();
const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { EmailForm } from "@/components/settings/integrations/email-form";
import { IntegrationsSettings } from "@/components/settings/integrations-settings";

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
      configured: false,
      passwordSet: false,
      host: "smtp.old.test",
      port: "587",
      user: "",
      from: "",
      imapHost: "",
      imapPort: "993",
      source: "none",
      testTo: "admin@example.com",
      ...email,
    },
    push: {
      configured: false,
      publicKey: "",
      subject: "mailto:admin@example.com",
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

function ok(data: unknown) {
  return { ok: true, data, error: null, status: 200 };
}

describe("IntegrationsSettings", () => {
  beforeEach(() => {
    refresh.mockReset();
    requestJson.mockReset();
    requestJson.mockImplementation(async (url: unknown) => {
      if (String(url).includes("/signal/contacts")) {
        return ok({ contacts: [] });
      }
      return ok({});
    });
  });

  it("keeps a saved email host when initial props go stale", async () => {
    const user = userEvent.setup();
    const initial = view();
    const saved = view({ host: "smtp.new.test", configured: true, source: "db" });
    requestJson.mockImplementation(async (url: unknown, init?: { method?: string }) => {
      if (String(url).includes("/signal/contacts")) {
        return ok({ contacts: [] });
      }
      if (init?.method === "PUT") return ok(saved);
      return ok({});
    });

    const { rerender } = render(<IntegrationsSettings initial={initial} />);
    await user.click(screen.getByRole("button", { name: /Email/ }));
    const host = screen.getByLabelText("SMTP host");
    await user.clear(host);
    await user.type(host, "smtp.new.test");
    await user.click(screen.getByRole("button", { name: "Save email" }));
    await waitFor(() =>
      expect(requestJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/settings/integrations"),
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(host).toHaveProperty("value", "smtp.new.test");

    rerender(<IntegrationsSettings initial={view()} />);
    expect(screen.getByLabelText("SMTP host")).toHaveProperty(
      "value",
      "smtp.new.test",
    );
  });

  it("does not overwrite an email draft when parent view changes", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const { rerender } = render(
      <EmailForm view={view()} onSaved={onSaved} />,
    );
    await user.click(screen.getByRole("button", { name: /Email/ }));
    const host = screen.getByLabelText("SMTP host");
    await user.clear(host);
    await user.type(host, "smtp.draft.test");

    rerender(
      <EmailForm
        view={view({ host: "smtp.from-server.test" })}
        onSaved={onSaved}
      />,
    );
    expect(host).toHaveProperty("value", "smtp.draft.test");
  });
});
