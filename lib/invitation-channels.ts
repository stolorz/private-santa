import type {
  InvitationChannel,
  InvitationRecipient,
  InvitationRoundGroup,
  InvitationSendChannels,
  InvitationSendView,
  InvitationUnreachable,
} from "@/lib/invitation-send-types";

export const NO_DRAW_REASON =
  "Invitations can only be sent after the draw has run.";
export const NO_CHANNELS_REASON =
  "No delivery channels are configured. Set up Email, WhatsApp, or Signal under Settings.";
export const NO_CHANNEL_SELECTED_REASON =
  "Select at least one delivery channel.";
export const ALL_RECEIVED_REASON =
  "Everyone in this draw has already received an invitation.";
export const REMAINING_UNREACHABLE_REASON =
  "The remaining guests have no email or phone for the configured channels.";
export const NONE_REACHABLE_REASON =
  "None of the guests in this draw can be reached on a configured channel.";
export const NO_PRIOR_SEND_REASON =
  "Send a first invitation before resending to everyone.";
export const EVENT_PAST_REASON =
  "Invitations cannot be sent after the event date.";

export function missingConjugationReason(names: string[]): string | null {
  if (names.length === 0) return null;
  return `Cannot send invitations because the following guests have at least one missing Polish conjugation: ${names.join(", ")}.`;
}

export function missingGenderReason(names: string[]): string | null {
  if (names.length === 0) return null;
  return `Cannot send invitations because the following guests have no gender: ${names.join(", ")}.`;
}

const SELECTED_UNREACHABLE_REASON =
  "Cannot be reached on the selected channels";

function bothBlocked(reason: string): {
  pending: { disabled: true; disabledReason: string };
  resend: { disabled: true; disabledReason: string };
} {
  return {
    pending: { disabled: true, disabledReason: reason },
    resend: { disabled: true, disabledReason: reason },
  };
}

export function invitationActionState(opts: {
  eventPast: boolean;
  missingDateReason?: string | null;
  missingGenderReason?: string | null;
  missingConjugationReason?: string | null;
  missingEventTranslationsReason?: string | null;
  missingEventLocationReason?: string | null;
  invalidTemplatesReason?: string | null;
  missingBudgetReason?: string | null;
  missingBudgetSentenceReason?: string | null;
  missingEmailTemplateReason?: string | null;
  missingSignalTemplateReason?: string | null;
  activeChannels: InvitationSendChannels;
  configuredChannels?: InvitationSendChannels;
  pendingCount: number;
  pendingUnreachableCount: number;
  resendRoundCount: number;
  hasPriorSend: boolean;
}): {
  pending: { disabled: boolean; disabledReason: string | null };
  resend: { disabled: boolean; disabledReason: string | null };
} {
  const configured = opts.configuredChannels ?? opts.activeChannels;
  if (opts.missingDateReason) return bothBlocked(opts.missingDateReason);
  if (opts.eventPast) return bothBlocked(EVENT_PAST_REASON);
  if (opts.missingGenderReason) return bothBlocked(opts.missingGenderReason);
  if (opts.missingConjugationReason) {
    return bothBlocked(opts.missingConjugationReason);
  }
  if (opts.missingEventTranslationsReason) {
    return bothBlocked(opts.missingEventTranslationsReason);
  }
  if (opts.missingEventLocationReason) {
    return bothBlocked(opts.missingEventLocationReason);
  }
  if (opts.invalidTemplatesReason) {
    return bothBlocked(opts.invalidTemplatesReason);
  }
  if (opts.missingBudgetReason) return bothBlocked(opts.missingBudgetReason);
  if (opts.missingBudgetSentenceReason) {
    return bothBlocked(opts.missingBudgetSentenceReason);
  }
  if (opts.activeChannels.email && opts.missingEmailTemplateReason) {
    return bothBlocked(opts.missingEmailTemplateReason);
  }
  if (opts.activeChannels.signal && opts.missingSignalTemplateReason) {
    return bothBlocked(opts.missingSignalTemplateReason);
  }
  if (!anyInvitationChannel(opts.activeChannels)) {
    return bothBlocked(
      anyInvitationChannel(configured)
        ? NO_CHANNEL_SELECTED_REASON
        : NO_CHANNELS_REASON,
    );
  }
  return {
    pending:
      opts.pendingCount === 0
        ? {
            disabled: true,
            disabledReason:
              opts.pendingUnreachableCount === 0
                ? ALL_RECEIVED_REASON
                : REMAINING_UNREACHABLE_REASON,
          }
        : { disabled: false, disabledReason: null },
    resend:
      opts.resendRoundCount === 0
        ? { disabled: true, disabledReason: NONE_REACHABLE_REASON }
        : opts.hasPriorSend
          ? { disabled: false, disabledReason: null }
          : { disabled: true, disabledReason: NO_PRIOR_SEND_REASON },
  };
}

export function anyInvitationChannel(
  channels: InvitationSendChannels,
): boolean {
  return channels.whatsapp || channels.signal || channels.email;
}

export function intersectInvitationChannels(
  configured: InvitationSendChannels,
  selected: InvitationSendChannels,
): InvitationSendChannels {
  return {
    whatsapp: configured.whatsapp && selected.whatsapp,
    signal: configured.signal && selected.signal,
    email: configured.email && selected.email,
  };
}

function filterRecipients(
  recipients: InvitationRecipient[],
  channels: InvitationSendChannels,
): {
  recipients: InvitationRecipient[];
  demoted: InvitationUnreachable[];
} {
  const kept: InvitationRecipient[] = [];
  const demoted: InvitationUnreachable[] = [];
  for (const recipient of recipients) {
    const next = recipient.channels.filter(
      (channel: InvitationChannel) => channels[channel],
    );
    if (next.length > 0) {
      kept.push({ ...recipient, channels: next });
    } else {
      demoted.push({
        assignmentId: recipient.assignmentId,
        name: recipient.name,
        reason: SELECTED_UNREACHABLE_REASON,
      });
    }
  }
  return { recipients: kept, demoted };
}

/** Restrict an invitation view to the organiser's selected channels. */
export function applyChannelSelection(
  view: InvitationSendView,
  selected: InvitationSendChannels,
): InvitationSendView {
  const channels = intersectInvitationChannels(view.channels, selected);
  if (!view.drawn) return { ...view, channels };

  const pendingFiltered = filterRecipients(view.pending.recipients, channels);
  const resendRounds: InvitationRoundGroup[] = [];
  const resendDemoted: InvitationUnreachable[] = [];
  for (const group of view.resend.rounds) {
    const filtered = filterRecipients(group.guests, channels);
    if (filtered.recipients.length > 0) {
      resendRounds.push({ round: group.round, guests: filtered.recipients });
    }
    resendDemoted.push(...filtered.demoted);
  }

  const pendingUnreachable = [
    ...view.pending.unreachable,
    ...pendingFiltered.demoted,
  ];
  const resendUnreachable = [...view.resend.unreachable, ...resendDemoted];

  const actions = invitationActionState({
    eventPast: view.eventPast,
    missingDateReason: view.missingDateReason,
    missingGenderReason: view.missingGenderReason,
    missingConjugationReason: view.missingConjugationReason,
    missingEventTranslationsReason: view.missingEventTranslationsReason,
    missingEventLocationReason: view.missingEventLocationReason,
    invalidTemplatesReason: view.invalidTemplatesReason,
    missingBudgetReason: view.missingBudgetReason,
    missingBudgetSentenceReason: view.missingBudgetSentenceReason,
    missingEmailTemplateReason: view.missingEmailTemplateReason,
    missingSignalTemplateReason: view.missingSignalTemplateReason,
    activeChannels: channels,
    configuredChannels: view.channels,
    pendingCount: pendingFiltered.recipients.length,
    pendingUnreachableCount: pendingUnreachable.length,
    resendRoundCount: resendRounds.length,
    hasPriorSend: view.hasPriorSend,
  });

  return {
    ...view,
    channels,
    pending: {
      ...actions.pending,
      recipients: pendingFiltered.recipients,
      unreachable: pendingUnreachable,
    },
    resend: {
      ...actions.resend,
      rounds: resendRounds,
      unreachable: resendUnreachable,
    },
  };
}
