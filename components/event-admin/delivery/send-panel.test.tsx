/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InvitationSendView } from "@/lib/invitation-send-types";

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

import { MISSING_EVENT_DATE_SEND_REASON } from "@/lib/event-date";
import { EVENT_PAST_REASON } from "@/lib/invitation-channels";
import { SendPanel } from "@/components/event-admin/delivery/send-panel";

const CHANNELS = { whatsapp: true, signal: false, email: true };

function view(overrides: Partial<InvitationSendView> = {}): InvitationSendView {
  return {
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
    channels: CHANNELS,
    hasPriorSend: true,
    pending: {
      disabled: false,
      disabledReason: null,
      recipients: [
        { assignmentId: 1, name: "Ada", channels: ["whatsapp", "email"] },
      ],
      unreachable: [{ assignmentId: 9, name: "Ivy", reason: "No phone number" }],
    },
    resend: {
      disabled: false,
      disabledReason: null,
      rounds: [
        {
          round: 1,
          guests: [{ assignmentId: 1, name: "Ada", channels: ["email"] }],
        },
        {
          round: 2,
          guests: [{ assignmentId: 2, name: "Bea", channels: ["whatsapp"] }],
        },
        {
          round: 3,
          guests: [{ assignmentId: 3, name: "Cal", channels: ["email"] }],
        },
        {
          round: 11,
          guests: [{ assignmentId: 4, name: "Dot", channels: ["email"] }],
        },
        {
          round: 21,
          guests: [{ assignmentId: 5, name: "Eve", channels: ["email"] }],
        },
        {
          round: 22,
          guests: [{ assignmentId: 6, name: "Fay", channels: ["email"] }],
        },
        {
          round: 23,
          guests: [{ assignmentId: 7, name: "Gia", channels: ["email"] }],
        },
        {
          round: 24,
          guests: [{ assignmentId: 8, name: "Hal", channels: ["email"] }],
        },
      ],
      unreachable: [],
    },
    history: [
      {
        batchId: "b1",
        source: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        rows: [
          {
            assignmentId: 1,
            name: "Ada",
            channel: "whatsapp",
            status: "sent",
            error: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            assignmentId: 1,
            name: "Ada",
            channel: "email",
            status: "failed",
            error: "550",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
          {
            assignmentId: 2,
            name: "Bea",
            channel: "signal",
            status: "skipped",
            error: "no phone",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("SendPanel", () => {
  it("posts pending then resend and shows a send error", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    refresh.mockReset();
    requestJson
      .mockResolvedValueOnce({ ok: true, data: {}, error: null, status: 200 })
      .mockResolvedValueOnce({
        ok: false,
        data: null,
        error: "Nothing to send.",
        status: 400,
      });

    render(
      <SendPanel
        code="abcdef"
        view={view()}
        selectedChannels={{ whatsapp: true, signal: false, email: true }}
      />,
    );

    expect(screen.getAllByText(/not configured, skipped/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
    expect(screen.getByText(/first time/)).toBeTruthy();
    expect(screen.getByText(/second time/)).toBeTruthy();
    expect(screen.getByText(/third time/)).toBeTruthy();
    expect(screen.getByText(/11th time/)).toBeTruthy();
    expect(screen.getByText(/21st time/)).toBeTruthy();
    expect(screen.getByText(/22nd time/)).toBeTruthy();
    expect(screen.getByText(/23rd time/)).toBeTruthy();
    expect(screen.getByText(/24th time/)).toBeTruthy();
    expect(screen.getByText(/Email failed — 550/)).toBeTruthy();

    const [pending, resend] = screen.getAllByRole("button", { name: "Send now" });
    await user.click(pending);
    await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(1));
    expect(requestJson.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        mode: "pending",
        channels: { whatsapp: true, signal: false, email: true },
      }),
    });
    expect(refresh).toHaveBeenCalled();

    await user.click(resend);
    await waitFor(() => expect(screen.getByText("Nothing to send.")).toBeTruthy());
  });

  it("explains an undrawn edition and empty pending list", () => {
    render(
      <SendPanel
        code="abcdef"
        view={view({
          drawn: false,
          pending: {
            disabled: true,
            disabledReason: "Run the draw before sending invitations.",
            recipients: [],
            unreachable: [],
          },
          resend: {
            disabled: true,
            disabledReason: "Run the draw before sending invitations.",
            rounds: [],
            unreachable: [],
          },
          history: [],
        })}
        selectedChannels={CHANNELS}
      />,
    );
    expect(
      screen.getAllByText("Run the draw before sending invitations.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("No invitations have been sent yet.")).toBeTruthy();
  });

  it("does not post a send when the event date is in the past", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();

    render(
      <SendPanel
        code="abcdef"
        view={view({ eventPast: true })}
        selectedChannels={CHANNELS}
      />,
    );

    expect(screen.getAllByText(EVENT_PAST_REASON)).toHaveLength(2);
    const buttons = screen.getAllByRole("button", { name: "Send now" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveProperty("disabled", true);
      await user.click(button);
    }
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("does not post a send when an edition template does not parse", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    const reason =
      "Cannot send invitations because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.";

    render(
      <SendPanel
        code="abcdef"
        view={view({ invalidTemplatesReason: reason })}
        selectedChannels={CHANNELS}
      />,
    );

    expect(screen.getAllByText(reason)).toHaveLength(2);
    const buttons = screen.getAllByRole("button", { name: "Send now" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveProperty("disabled", true);
      await user.click(button);
    }
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("does not post a send when the party date is missing", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();

    render(
      <SendPanel
        code="abcdef"
        view={view({ missingDateReason: MISSING_EVENT_DATE_SEND_REASON })}
        selectedChannels={CHANNELS}
      />,
    );

    expect(screen.getAllByText(MISSING_EVENT_DATE_SEND_REASON)).toHaveLength(2);
    const buttons = screen.getAllByRole("button", { name: "Send now" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveProperty("disabled", true);
      await user.click(button);
    }
    expect(requestJson).not.toHaveBeenCalled();
  });
});
