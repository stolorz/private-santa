import type {
  InvitationChannel,
  InvitationSource,
  InvitationSendStatus,
} from "@/lib/db/schema";

export type { InvitationChannel, InvitationSource, InvitationSendStatus };

export type InvitationSendChannels = {
  whatsapp: boolean;
  signal: boolean;
  email: boolean;
};

export type DeliverySummary = {
  whatsapp: { sent: number; failed: number; errors: string[] } | null;
  signal: { sent: number; failed: number; errors: string[] } | null;
  email: { sent: number; failed: number } | null;
};

export type InvitationRecipient = {
  assignmentId: number;
  name: string;
  channels: InvitationChannel[];
};

export type InvitationUnreachable = {
  assignmentId: number;
  name: string;
  reason: string;
};

export type InvitationRoundGroup = {
  /** 1 = first invitation, 2 = second, … */
  round: number;
  guests: InvitationRecipient[];
};

export type InvitationSendLogRow = {
  assignmentId: number;
  name: string;
  channel: InvitationChannel;
  status: InvitationSendStatus;
  error: string | null;
  createdAt: string;
};

export type InvitationSendBatchView = {
  batchId: string;
  source: InvitationSource;
  createdAt: string;
  rows: InvitationSendLogRow[];
};

export type InvitationActionView = {
  disabled: boolean;
  disabledReason: string | null;
};

export type InvitationSendView = {
  drawn: boolean;
  eventPast: boolean;
  /** Set when the edition has no real party date. Blocks both sends. */
  missingDateReason: string | null;
  /** Set when a seated guest has no gender. Blocks both sends. */
  missingGenderReason: string | null;
  /** Set when a seated guest is missing a Polish case. Blocks both sends. */
  missingConjugationReason: string | null;
  /** Set when the edition is missing a Polish, German, Spanish, or Japanese name. */
  missingEventTranslationsReason: string | null;
  /** Set when the edition has no place name or no Polish "gdzie?" phrase. */
  missingEventLocationReason: string | null;
  /** Set when any edition template fails to parse. Blocks both sends. */
  invalidTemplatesReason: string | null;
  /** Set when neither the draw nor the edition has a budget choice. */
  missingBudgetReason: string | null;
  /** Set when the active budget sentence is blank for a guest language. */
  missingBudgetSentenceReason: string | null;
  /** Set when a guest who would receive email has no email template in their language. */
  missingEmailTemplateReason: string | null;
  /** Set when a guest who would receive Signal has no Signal template in their language. */
  missingSignalTemplateReason: string | null;
  channels: InvitationSendChannels;
  hasPriorSend: boolean;
  pending: InvitationActionView & {
    recipients: InvitationRecipient[];
    unreachable: InvitationUnreachable[];
  };
  resend: InvitationActionView & {
    rounds: InvitationRoundGroup[];
    unreachable: InvitationUnreachable[];
  };
  history: InvitationSendBatchView[];
};

export const INVITATION_CHANNEL_ORDER: InvitationChannel[] = [
  "whatsapp",
  "signal",
  "email",
];

export const INVITATION_CHANNEL_LABEL: Record<InvitationChannel, string> = {
  whatsapp: "WhatsApp",
  signal: "Signal",
  email: "Email",
};

export function toDeliverFlags(channels: InvitationSendChannels): {
  deliverWhatsapp: boolean;
  deliverSignal: boolean;
  deliverEmail: boolean;
} {
  return {
    deliverWhatsapp: channels.whatsapp,
    deliverSignal: channels.signal,
    deliverEmail: channels.email,
  };
}

export function fromDeliverFlags(draw: {
  deliverWhatsapp: boolean;
  deliverSignal: boolean;
  deliverEmail: boolean;
}): InvitationSendChannels {
  return {
    whatsapp: draw.deliverWhatsapp,
    signal: draw.deliverSignal,
    email: draw.deliverEmail,
  };
}
