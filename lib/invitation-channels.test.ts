import { describe, expect, it } from "vitest";
import {
  ALL_RECEIVED_REASON,
  EVENT_PAST_REASON,
  NO_CHANNEL_SELECTED_REASON,
  NO_CHANNELS_REASON,
  NO_PRIOR_SEND_REASON,
  applyChannelSelection,
  intersectInvitationChannels,
  invitationActionState,
  missingConjugationReason,
  missingGenderReason,
} from "@/lib/invitation-channels";
import type { InvitationSendView } from "@/lib/invitation-send-types";

const configured = { whatsapp: true, signal: true, email: true };
const none = { whatsapp: false, signal: false, email: false };

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
    channels: configured,
    hasPriorSend: true,
    pending: {
      disabled: false,
      disabledReason: null,
      recipients: [
        { assignmentId: 1, name: "Ada", channels: ["whatsapp", "email"] },
        { assignmentId: 2, name: "Bea", channels: ["signal"] },
      ],
      unreachable: [],
    },
    resend: {
      disabled: false,
      disabledReason: null,
      rounds: [
        {
          round: 1,
          guests: [
            { assignmentId: 1, name: "Ada", channels: ["whatsapp", "email"] },
            { assignmentId: 2, name: "Bea", channels: ["signal"] },
          ],
        },
      ],
      unreachable: [],
    },
    history: [],
    ...overrides,
  };
}

function actionState(
  overrides: Partial<Parameters<typeof invitationActionState>[0]> = {},
) {
  return invitationActionState({
    eventPast: false,
    activeChannels: configured,
    pendingCount: 1,
    pendingUnreachableCount: 0,
    resendRoundCount: 1,
    hasPriorSend: true,
    ...overrides,
  });
}

describe("missingGenderReason", () => {
  it("returns null when every guest has a gender", () => {
    expect(missingGenderReason([])).toBeNull();
  });

  it("names the guests in the order it is given", () => {
    expect(missingGenderReason(["Ada", "Bea"])).toBe(
      "Cannot send invitations because the following guests have no gender: Ada, Bea.",
    );
  });
});

describe("missingConjugationReason", () => {
  it("returns null when every guest has the six cases", () => {
    expect(missingConjugationReason([])).toBeNull();
  });

  it("names the guests in the order it is given", () => {
    expect(missingConjugationReason(["Anna", "Bartek"])).toBe(
      "Cannot send invitations because the following guests have at least one missing Polish conjugation: Anna, Bartek.",
    );
  });
});

describe("invitationActionState", () => {
  it("blocks both sends for a missing date before a past event, gender, and channels", () => {
    const state = actionState({
      eventPast: true,
      missingDateReason: "date",
      missingGenderReason: "gender",
      activeChannels: none,
    });
    expect(state.pending).toEqual({ disabled: true, disabledReason: "date" });
    expect(state.resend).toEqual({ disabled: true, disabledReason: "date" });
  });

  it("lets a past event hide a missing-gender block", () => {
    const state = actionState({
      eventPast: true,
      missingGenderReason: "gender",
      missingConjugationReason: "cases",
    });
    expect(state.pending.disabledReason).toBe(EVENT_PAST_REASON);
    expect(state.resend.disabledReason).toBe(EVENT_PAST_REASON);
  });

  it("blocks both sends for a missing gender before cases and channels", () => {
    const state = actionState({
      activeChannels: none,
      missingGenderReason: "gender",
      missingConjugationReason: "cases",
    });
    expect(state.pending).toEqual({ disabled: true, disabledReason: "gender" });
    expect(state.resend).toEqual({ disabled: true, disabledReason: "gender" });
  });

  it("lets a past event hide a missing-case block", () => {
    const state = actionState({
      eventPast: true,
      missingConjugationReason: "cases",
    });
    expect(state.pending).toEqual({
      disabled: true,
      disabledReason: EVENT_PAST_REASON,
    });
    expect(state.resend.disabledReason).toBe(EVENT_PAST_REASON);
  });

  it("blocks both sends for missing cases before channel reasons", () => {
    const state = actionState({
      activeChannels: none,
      missingConjugationReason: "cases",
      missingEventTranslationsReason: "translations",
    });
    expect(state.pending).toEqual({ disabled: true, disabledReason: "cases" });
    expect(state.resend).toEqual({ disabled: true, disabledReason: "cases" });
  });

  it("blocks both sends for missing event translations before channel reasons", () => {
    const state = actionState({
      activeChannels: none,
      missingEventTranslationsReason: "translations",
    });
    expect(state.pending).toEqual({
      disabled: true,
      disabledReason: "translations",
    });
    expect(state.resend).toEqual({
      disabled: true,
      disabledReason: "translations",
    });
  });

  it("blocks both sends for a missing location after translations and before the budget", () => {
    const afterTranslations = actionState({
      missingEventTranslationsReason: "translations",
      missingEventLocationReason: "location",
    });
    expect(afterTranslations.pending.disabledReason).toBe("translations");
    const state = actionState({
      activeChannels: none,
      missingEventLocationReason: "location",
      missingBudgetReason: "budget",
    });
    expect(state.pending).toEqual({ disabled: true, disabledReason: "location" });
    expect(state.resend).toEqual({ disabled: true, disabledReason: "location" });
  });

  it("blocks both sends for invalid templates after location and before budget, including WhatsApp-only", () => {
    const afterLocation = actionState({
      missingEventLocationReason: "location",
      invalidTemplatesReason: "templates",
    });
    expect(afterLocation.pending.disabledReason).toBe("location");
    const state = actionState({
      activeChannels: { whatsapp: true, signal: false, email: false },
      invalidTemplatesReason: "templates",
      missingBudgetReason: "budget",
    });
    expect(state.pending).toEqual({
      disabled: true,
      disabledReason: "templates",
    });
    expect(state.resend).toEqual({
      disabled: true,
      disabledReason: "templates",
    });
  });

  it("blocks email and Signal only when that channel is selected", () => {
    const emailReason = "missing email templates";
    const signalReason = "missing Signal templates";
    const both = actionState({
      missingEmailTemplateReason: emailReason,
      missingSignalTemplateReason: signalReason,
    });
    expect(both.pending.disabledReason).toBe(emailReason);
    expect(both.resend.disabledReason).toBe(emailReason);

    const signalOnly = actionState({
      activeChannels: { whatsapp: false, signal: true, email: false },
      missingEmailTemplateReason: emailReason,
      missingSignalTemplateReason: signalReason,
    });
    expect(signalOnly.pending.disabledReason).toBe(signalReason);

    const whatsappOnly = actionState({
      activeChannels: { whatsapp: true, signal: false, email: false },
      missingEmailTemplateReason: emailReason,
      missingSignalTemplateReason: signalReason,
    });
    expect(whatsappOnly.pending.disabled).toBe(false);
    expect(whatsappOnly.resend.disabled).toBe(false);
  });
});

describe("intersectInvitationChannels", () => {
  it("keeps only channels that are both configured and selected", () => {
    expect(
      intersectInvitationChannels(configured, {
        whatsapp: false,
        signal: true,
        email: true,
      }),
    ).toEqual({ whatsapp: false, signal: true, email: true });
    expect(
      intersectInvitationChannels(
        { whatsapp: false, signal: true, email: true },
        configured,
      ),
    ).toEqual({ whatsapp: false, signal: true, email: true });
  });
});

describe("applyChannelSelection", () => {
  it("only updates channels when the edition has not been drawn", () => {
    const next = applyChannelSelection(view({ drawn: false }), {
      whatsapp: false,
      signal: true,
      email: true,
    });
    expect(next.drawn).toBe(false);
    expect(next.channels).toEqual({
      whatsapp: false,
      signal: true,
      email: true,
    });
    expect(next.pending.recipients).toEqual(view().pending.recipients);
  });

  it("drops unselected channels from each guest and demotes those with none left", () => {
    const next = applyChannelSelection(view(), {
      whatsapp: false,
      signal: false,
      email: true,
    });

    expect(next.channels).toEqual({
      whatsapp: false,
      signal: false,
      email: true,
    });
    expect(next.pending.recipients).toEqual([
      { assignmentId: 1, name: "Ada", channels: ["email"] },
    ]);
    expect(next.pending.unreachable).toEqual([
      {
        assignmentId: 2,
        name: "Bea",
        reason: "Cannot be reached on the selected channels",
      },
    ]);
    expect(next.resend.rounds[0]?.guests).toEqual([
      { assignmentId: 1, name: "Ada", channels: ["email"] },
    ]);
  });

  it("asks the organiser to select a channel when none are on", () => {
    const next = applyChannelSelection(view(), none);
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(NO_CHANNEL_SELECTED_REASON);
    expect(next.resend.disabledReason).toBe(NO_CHANNEL_SELECTED_REASON);
  });

  it("keeps the configured-channels reason when nothing is set up", () => {
    const next = applyChannelSelection(
      view({
        channels: none,
        pending: {
          disabled: true,
          disabledReason: NO_CHANNELS_REASON,
          recipients: [],
          unreachable: [],
        },
        resend: {
          disabled: true,
          disabledReason: NO_CHANNELS_REASON,
          rounds: [],
          unreachable: [],
        },
      }),
      configured,
    );
    expect(next.pending.disabledReason).toBe(NO_CHANNELS_REASON);
  });

  it("keeps resend disabled when nothing has been sent yet", () => {
    const next = applyChannelSelection(
      view({
        hasPriorSend: false,
        resend: {
          disabled: true,
          disabledReason: NO_PRIOR_SEND_REASON,
          rounds: [
            {
              round: 1,
              guests: [
                { assignmentId: 1, name: "Ada", channels: ["whatsapp", "email"] },
                { assignmentId: 2, name: "Bea", channels: ["signal"] },
              ],
            },
          ],
          unreachable: [],
        },
      }),
      { whatsapp: false, signal: false, email: true },
    );

    expect(next.resend.disabled).toBe(true);
    expect(next.resend.disabledReason).toBe(NO_PRIOR_SEND_REASON);
    expect(next.resend.rounds).toEqual([
      {
        round: 1,
        guests: [{ assignmentId: 1, name: "Ada", channels: ["email"] }],
      },
    ]);
  });

  it("keeps both sends locked when the party date is missing", () => {
    const reason =
      "Cannot send invitations because the event has no valid party date. Set the date before sending, because guest messages include it.";
    const next = applyChannelSelection(
      view({ missingDateReason: reason, eventPast: true }),
      none,
    );
    expect(next.missingDateReason).toBe(reason);
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(reason);
    expect(next.resend.disabledReason).toBe(reason);
  });

  it("keeps both sends locked when a guest has no gender", () => {
    const reason =
      "Cannot send invitations because the following guests have no gender: Ada.";
    const next = applyChannelSelection(
      view({ missingGenderReason: reason }),
      none,
    );
    expect(next.missingGenderReason).toBe(reason);
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(reason);
    expect(next.resend.disabledReason).toBe(reason);
  });

  it("keeps both sends locked when the budget choice is missing", () => {
    const reason = "Choose a budget, make-the-gift, or no spending limit.";
    const state = actionState({ missingBudgetReason: reason });
    expect(state.pending.disabledReason).toBe(reason);
    expect(state.resend.disabledReason).toBe(reason);
  });

  it("keeps both sends locked when a guest is missing a Polish case", () => {
    const reason =
      "Cannot send invitations because the following guests have at least one missing Polish conjugation: Ada.";
    const next = applyChannelSelection(
      view({ missingConjugationReason: reason }),
      none,
    );
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(reason);
    expect(next.resend.disabledReason).toBe(reason);
  });

  it("keeps both sends locked when the event is missing a translation", () => {
    const reason =
      "Cannot send invitations because the event is missing name translations: German.";
    const next = applyChannelSelection(
      view({ missingEventTranslationsReason: reason }),
      none,
    );
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(reason);
    expect(next.resend.disabledReason).toBe(reason);
  });

  it("keeps both sends locked when an edition template does not parse", () => {
    const reason =
      "Cannot send invitations because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.";
    const next = applyChannelSelection(
      view({ invalidTemplatesReason: reason }),
      { whatsapp: true, signal: false, email: false },
    );
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(reason);
    expect(next.resend.disabledReason).toBe(reason);
  });

  it("keeps both sends locked when the event has no location", () => {
    const reason =
      "Cannot send invitations because the event is missing its location: place name.";
    const next = applyChannelSelection(
      view({ missingEventLocationReason: reason }),
      { whatsapp: true, signal: false, email: false },
    );
    expect(next.pending.disabledReason).toBe(reason);
    expect(next.resend.disabledReason).toBe(reason);
  });

  it("allows a WhatsApp-only selection when email templates are missing", () => {
    const next = applyChannelSelection(
      view({
        missingEmailTemplateReason:
          "Cannot send email invitations because the following guests have no email templates in their language: Ada (xx).",
      }),
      { whatsapp: true, signal: false, email: false },
    );
    expect(next.pending.disabled).toBe(false);
    expect(next.resend.disabled).toBe(false);
  });

  it("keeps send and resend locked when the event date has passed", () => {
    const next = applyChannelSelection(
      view({
        eventPast: true,
        pending: {
          disabled: true,
          disabledReason: EVENT_PAST_REASON,
          recipients: [
            { assignmentId: 1, name: "Ada", channels: ["whatsapp", "email"] },
          ],
          unreachable: [],
        },
        resend: {
          disabled: true,
          disabledReason: EVENT_PAST_REASON,
          rounds: [
            {
              round: 1,
              guests: [
                { assignmentId: 1, name: "Ada", channels: ["whatsapp", "email"] },
              ],
            },
          ],
          unreachable: [],
        },
      }),
      { whatsapp: false, signal: false, email: true },
    );

    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).toBe(EVENT_PAST_REASON);
    expect(next.resend.disabled).toBe(true);
    expect(next.resend.disabledReason).toBe(EVENT_PAST_REASON);
    expect(next.pending.recipients).toEqual([
      { assignmentId: 1, name: "Ada", channels: ["email"] },
    ]);
  });

  it("does not claim everyone was invited when guests were only demoted", () => {
    const next = applyChannelSelection(
      view({
        pending: {
          disabled: false,
          disabledReason: null,
          recipients: [
            { assignmentId: 1, name: "Ada", channels: ["whatsapp"] },
          ],
          unreachable: [],
        },
      }),
      { whatsapp: false, signal: false, email: true },
    );
    expect(next.pending.recipients).toEqual([]);
    expect(next.pending.disabled).toBe(true);
    expect(next.pending.disabledReason).not.toBe(ALL_RECEIVED_REASON);
  });
});
