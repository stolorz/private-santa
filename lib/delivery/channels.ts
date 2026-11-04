import "server-only";
import { type BudgetSnapshot } from "@/lib/budget";
import type { Assignment, GuestView, InvitationChannel } from "@/lib/db/schema";
import { clipEmailFailReason, isEmailConfigured, sendEmailBatch } from "@/lib/email";
import { type EventLocationFields } from "@/lib/event-location";
import { type EventNameFields } from "@/lib/event-name";
import { anyInvitationChannel } from "@/lib/invitation-channels";
import type { InvitationSendChannels } from "@/lib/invitation-send-types";
import type { SendResult } from "@/lib/phone-send";
import { isSignalConfigured, sendBatch as sendSignalBatch } from "@/lib/signal";
import { missingInvitationTemplateReason, renderEmail, renderTemplate, type TemplatesView } from "@/lib/templates";
import { invitationVars } from "@/lib/templates/vars";
import { isWhatsAppConfigured, sendBatch as sendWhatsAppBatch } from "@/lib/whatsapp";

export { budgetCopy, budgetCopyForGuests } from "@/lib/templates/vars";

export type { SendResult };

export type DeliverableAssignment = {
  id: number;
  giverId: number;
  revealToken: string;
};

export type RenderContext = {
  templates: TemplatesView;
  event: EventNameFields;
  occursOn: string;
  location: EventLocationFields;
  amounts: BudgetSnapshot;
  guestCount: number;
};

export type OutboundMessage = {
  assignment: DeliverableAssignment;
  guest: GuestView;
  to: string;
  url: string;
};

export type AssignmentPatch = Partial<
  Pick<
    Assignment,
    | "deliveredWhatsapp"
    | "deliveredSignal"
    | "deliveredEmail"
    | "emailFailed"
    | "emailFailedReason"
  >
>;

export type ChannelWrite = {
  giverIds: number[];
  set: AssignmentPatch;
};

export type ChannelAttempt = {
  assignment: DeliverableAssignment;
  giverId: number;
  status: "sent" | "failed" | "skipped";
  error: string | null;
};

export type DrawDeliveryFlag = "deliverWhatsapp" | "deliverSignal" | "deliverEmail";

export interface ChannelAdapter {
  id: InvitationChannel;
  needs: "phone" | "email";
  flagKey: DrawDeliveryFlag;
  countSkippedAsFailed: boolean;
  unconfiguredError: string;
  isConfigured(): Promise<boolean>;
  missingAddress(name: string): string;
  addressFor(guest: GuestView, email: string | null): string | null;
  send(messages: OutboundMessage[], ctx: RenderContext): Promise<SendResult[]>;
  patches(attempts: ChannelAttempt[]): ChannelWrite[];
}

/**
 * Fail a guest before any copy is rendered when their language has no
 * template pack, or a required field is blank. Other guests in the batch
 * are still sent.
 */
async function sendWithTemplates(
  channel: "email" | "signal",
  messages: OutboundMessage[],
  templates: TemplatesView,
  sendReady: (ready: OutboundMessage[]) => Promise<SendResult[]>,
): Promise<SendResult[]> {
  const ready: OutboundMessage[] = [];
  const blocked = new Map<OutboundMessage, string>();
  for (const message of messages) {
    const reason = missingInvitationTemplateReason(
      channel,
      [{ name: message.guest.name, language: message.guest.language }],
      templates,
    );
    if (reason) blocked.set(message, reason);
    else ready.push(message);
  }
  const sent = ready.length === 0 ? [] : await sendReady(ready);
  let index = 0;
  return messages.map((message) => {
    const reason = blocked.get(message);
    if (reason) return { to: message.to, ok: false, error: reason };
    return sent[index++]!;
  });
}

function invitationMessageVars(
  ctx: RenderContext,
  message: OutboundMessage,
) {
  return invitationVars(ctx.templates, message.guest.language, {
    giver: message.guest,
    event: ctx.event,
    occursOn: ctx.occursOn,
    location: ctx.location,
    url: message.url,
    amounts: ctx.amounts,
    guestCount: ctx.guestCount,
  });
}

function phonePatches(flag: AssignmentPatch): ChannelAdapter["patches"] {
  return (attempts) => {
    const giverIds = attempts
      .filter((attempt) => attempt.status === "sent")
      .map((attempt) => attempt.giverId);
    return giverIds.length > 0 ? [{ giverIds, set: flag }] : [];
  };
}

function emailPatches(attempts: ChannelAttempt[]): ChannelWrite[] {
  const writes: ChannelWrite[] = [];
  const sentIds = attempts
    .filter((attempt) => attempt.status === "sent")
    .map((attempt) => attempt.giverId);
  if (sentIds.length > 0) {
    writes.push({
      giverIds: sentIds,
      set: {
        deliveredEmail: true,
        emailFailed: false,
        emailFailedReason: null,
      },
    });
  }
  const byReason = new Map<string, number[]>();
  for (const attempt of attempts) {
    if (attempt.status !== "failed" || !attempt.error) continue;
    const reason = clipEmailFailReason(attempt.error);
    const ids = byReason.get(reason) ?? [];
    ids.push(attempt.giverId);
    byReason.set(reason, ids);
  }
  for (const [reason, giverIds] of byReason) {
    writes.push({
      giverIds,
      set: { emailFailed: true, emailFailedReason: reason },
    });
  }
  return writes;
}

const whatsapp: ChannelAdapter = {
  id: "whatsapp",
  needs: "phone",
  flagKey: "deliverWhatsapp",
  countSkippedAsFailed: true,
  unconfiguredError:
    "WhatsApp delivery selected but WhatsApp is not configured. Add credentials under Settings → Integrations.",
  isConfigured: isWhatsAppConfigured,
  missingAddress: (name) => `${name} has no phone number`,
  addressFor: (guest) => guest.phone,
  send(messages) {
    return sendWhatsAppBatch(
      messages.map((message) => ({
        to: message.to,
        giverName: message.guest.name,
        secondParam: message.url,
      })),
    );
  },
  patches: phonePatches({ deliveredWhatsapp: true }),
};

const signal: ChannelAdapter = {
  id: "signal",
  needs: "phone",
  flagKey: "deliverSignal",
  countSkippedAsFailed: true,
  unconfiguredError:
    "Signal delivery selected but Signal is not linked. Link it under Settings → Integrations.",
  isConfigured: async () => isSignalConfigured(),
  missingAddress: (name) => `${name} has no phone number`,
  addressFor: (guest) => guest.phone,
  send(messages, ctx) {
    return sendWithTemplates("signal", messages, ctx.templates, (ready) =>
      sendSignalBatch(
        ready.map((message) => ({
          to: message.to,
          giverName: message.guest.name,
          secondParam: message.url,
          text: renderTemplate(
            ctx.templates,
            "signal.body",
            message.guest.language,
            invitationMessageVars(ctx, message),
          ),
        })),
      ),
    );
  },
  patches: phonePatches({ deliveredSignal: true }),
};

const email: ChannelAdapter = {
  id: "email",
  needs: "email",
  flagKey: "deliverEmail",
  countSkippedAsFailed: false,
  unconfiguredError:
    "Email delivery selected but email is not configured. Add a mailbox under Settings → Integrations.",
  isConfigured: isEmailConfigured,
  missingAddress: (name) => `${name} has no email address`,
  addressFor: (_guest, address) => address,
  send(messages, ctx) {
    return sendWithTemplates("email", messages, ctx.templates, (ready) =>
      sendEmailBatch(
        ready.map((message) => {
          const rendered = renderEmail(
            ctx.templates,
            message.guest.language,
            invitationMessageVars(ctx, message),
          );
          return {
            to: message.to,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
            revealToken: message.assignment.revealToken,
          };
        }),
      ),
    );
  },
  patches: emailPatches,
};

export const CHANNELS: ChannelAdapter[] = [whatsapp, signal, email];

export async function configuredInvitationChannels(): Promise<InvitationSendChannels> {
  const flags = await Promise.all(
    CHANNELS.map(async (channel) => [channel.id, await channel.isConfigured()] as const),
  );
  return Object.fromEntries(flags) as InvitationSendChannels;
}

export function channelsForGuest(
  guest: { phone: string | null },
  emailAddress: string | null,
  configured: InvitationSendChannels,
): InvitationChannel[] {
  return CHANNELS.filter((channel) => {
    if (!configured[channel.id]) return false;
    return Boolean(
      channel.needs === "phone" ? guest.phone : emailAddress,
    );
  }).map((channel) => channel.id);
}

export function unreachableReason(
  guest: { phone: string | null },
  emailAddress: string | null,
  configured: InvitationSendChannels,
): string {
  if (!anyInvitationChannel(configured)) {
    return "No delivery channels are configured";
  }
  const needPhone = configured.whatsapp || configured.signal;
  const needEmail = configured.email;
  const hasPhone = Boolean(guest.phone);
  const hasEmail = Boolean(emailAddress);
  if (needPhone && needEmail && !hasPhone && !hasEmail) {
    return "No email or phone number";
  }
  if (needPhone && !hasPhone) return "No phone number";
  if (needEmail && !hasEmail) return "No email address";
  return "Cannot be reached";
}

export async function unconfiguredDeliveryError(
  flags: Partial<Record<DrawDeliveryFlag, boolean>>,
): Promise<string | null> {
  for (const channel of CHANNELS) {
    if (flags[channel.flagKey] && !(await channel.isConfigured())) {
      return channel.unconfiguredError;
    }
  }
  return null;
}
