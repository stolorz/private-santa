/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationsView } from "@/lib/integrations-types";
import type { InvitationSendView } from "@/lib/invitation-send-types";
import { makeDraw } from "@/test/helpers/fixtures";

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

import { DeliveryTab } from "@/components/event-admin/delivery-tab";

const integrations: IntegrationsView = {
  whatsapp: {
    configured: true,
    tokenSet: true,
    phoneId: "1",
    template: "amigo_secreto",
    language: "pt_PT",
    source: "db",
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

const invitationSend: InvitationSendView = {
  drawn: true,
  eventPast: false,
  missingDateReason: null,
  missingGenderReason: null,
  missingConjugationReason: null,
  missingEventTranslationsReason: null,
    missingEventLocationReason: null,
    invalidTemplatesReason: null,
    missingBudgetReason: null,
  missingBudgetSentenceReason: null,
  missingEmailTemplateReason: null,
  missingSignalTemplateReason: null,
  channels: { whatsapp: false, signal: false, email: false },
  hasPriorSend: false,
  pending: {
    disabled: false,
    disabledReason: null,
    recipients: [],
    unreachable: [],
  },
  resend: {
    disabled: true,
    disabledReason: "Nothing to resend.",
    rounds: [],
    unreachable: [],
  },
  history: [],
};

describe("DeliveryTab", () => {
  beforeEach(() => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
  });

  it("persists a delivery channel toggle", async () => {
    const user = userEvent.setup();
    render(
      <DeliveryTab
        code="abcdef"
        integrations={integrations}
        invitationSend={invitationSend}
        currentDraw={{
          draw: makeDraw(),
          revealLinks: [],
          assignedGiverIds: [1],
          assignedReceiverIds: [2],
        }}
      />,
    );
    await user.click(screen.getByRole("switch", { name: /WhatsApp/ }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const [, init] = requestJson.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(String(init.body)).toContain("deliverWhatsapp");
  });
});
