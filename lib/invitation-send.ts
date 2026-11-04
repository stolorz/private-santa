import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mustExist } from "@/lib/utils";
import type { Assignment, Draw, Event, GuestView, InvitationSend } from "@/lib/db/schema";
import {
  budgetShownToGuests,
  effectiveBudgetKind,
  hasBudgetChoice,
  isCurrency,
  MISSING_BUDGET_CHOICE_MESSAGE,
} from "@/lib/budget";
import { isOccursOnPast } from "@/lib/event-code";
import {
  MISSING_EVENT_DATE_SEND_REASON,
  missingEventDateSendReason,
} from "@/lib/event-date";
import { missingEventLocationSendReason } from "@/lib/event-location";
import { missingEventTranslationsSendReason } from "@/lib/event-name";
import { getEventById } from "@/lib/events";
import {
  assignmentsForDraw,
  currentDrawWithAssignments,
  updateDrawChannels,
} from "@/lib/pairings";
import { guestEmailById, guestsForEvent } from "@/lib/people";
import { isGender } from "@/lib/gender";
import { missingNameCases } from "@/lib/name-cases";
import { compareNames } from "@/lib/person-name";
import {
  anyDelivered,
  deliveryFlagsFrom,
} from "@/lib/delivery-status";
import {
  channelsForGuest,
  configuredInvitationChannels,
  deliverAssignments,
  unreachableReason,
} from "@/lib/delivery";
import {
  INVITATION_CHANNEL_ORDER,
  type DeliverySummary,
  type InvitationRecipient,
  type InvitationRoundGroup,
  type InvitationSendBatchView,
  type InvitationSendChannels,
  type InvitationSendView,
  type InvitationUnreachable,
} from "@/lib/invitation-send-types";
import {
  NO_DRAW_REASON,
  applyChannelSelection,
  invitationActionState,
  missingConjugationReason,
  missingGenderReason,
} from "@/lib/invitation-channels";

import { InvitationSendError } from "@/lib/errors";
import { missingInvitationTemplateReason } from "@/lib/templates";
import { missingBudgetSentenceReason } from "@/lib/templates/fields";
import { invalidTemplatesReason } from "@/lib/templates/validate";
import { getEventTemplates } from "@/lib/templates/store";
import type { TemplatesView } from "@/lib/templates";
export { InvitationSendError };
export { channelsForGuest, unreachableReason };

function emptyView(
  channels: InvitationSendChannels,
  reason: string,
): InvitationSendView {
  return {
    drawn: false,
    eventPast: false,
    channels,
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
    hasPriorSend: false,
    pending: {
      disabled: true,
      disabledReason: reason,
      recipients: [],
      unreachable: [],
    },
    resend: {
      disabled: true,
      disabledReason: reason,
      rounds: [],
      unreachable: [],
    },
    history: [],
  };
}

function alreadyReceived(assignment: Assignment): boolean {
  return anyDelivered(deliveryFlagsFrom(assignment));
}

/** Coerce SQLite timestamp values (Date, epoch seconds/ms, or ISO strings). */
export function createdAtMs(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function createdAtIso(value: Date | number | string): string {
  return new Date(createdAtMs(value)).toISOString();
}

function priorRounds(
  assignment: Assignment,
  sentBatches: Map<number, Set<string>>,
): number {
  const n = sentBatches.get(assignment.id)?.size ?? 0;
  if (n > 0) return n;
  if (alreadyReceived(assignment)) return 1;
  return 0;
}

function sortRecipients(list: InvitationRecipient[]): InvitationRecipient[] {
  return [...list].sort((a, b) => compareNames(a.name, b.name));
}

function groupHistory(
  logs: InvitationSend[],
  nameByAssignment: Map<number, string>,
): InvitationSendBatchView[] {
  const byBatch = new Map<string, InvitationSend[]>();
  for (const row of logs) {
    const list = byBatch.get(row.batchId) ?? [];
    list.push(row);
    byBatch.set(row.batchId, list);
  }
  const batches: InvitationSendBatchView[] = [];
  for (const rows of byBatch.values()) {
    const newest = Math.max(...rows.map((r) => createdAtMs(r.createdAt)));
    const first = rows[0];
    const named = rows
      .map((r) => ({
        assignmentId: r.assignmentId,
        name: nameByAssignment.get(r.assignmentId) ?? `#${r.assignmentId}`,
        channel: r.channel,
        status: r.status,
        error: r.error,
        createdAt: createdAtIso(r.createdAt),
      }))
      .sort((a, b) => {
        const byName = compareNames(a.name, b.name);
        if (byName !== 0) return byName;
        return (
          INVITATION_CHANNEL_ORDER.indexOf(a.channel) -
          INVITATION_CHANNEL_ORDER.indexOf(b.channel)
        );
      });
    batches.push({
      batchId: first.batchId,
      source: first.source,
      createdAt: new Date(newest).toISOString(),
      rows: named,
    });
  }
  batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return batches;
}

export type InvitationSendMode = "pending" | "resend";

type DeliveryState = {
  channels: InvitationSendChannels;
  eventPast: boolean;
  draw: Draw | null;
  assignments: Assignment[];
  guests: GuestView[];
  event: Event | undefined;
  logs: InvitationSend[];
  emails: Map<number, string>;
  templates: TemplatesView;
};

async function loadDeliveryState(eventId: number): Promise<DeliveryState> {
  const [channels, event, current, templates] = await Promise.all([
    configuredInvitationChannels(),
    getEventById(eventId),
    currentDrawWithAssignments(eventId),
    getEventTemplates(eventId),
  ]);
  const eventPast = event != null && isOccursOnPast(event.occursOn);
  const draw =
    current?.draw.status === "completed" ? current.draw : null;
  if (!draw) {
    return {
      channels,
      eventPast,
      draw: null,
      assignments: [],
      guests: [],
      event,
      logs: [],
      emails: new Map(),
      templates,
    };
  }

  const [guests, logs] = await Promise.all([
    guestsForEvent(eventId),
    db
      .select()
      .from(schema.invitationSend)
      .where(eq(schema.invitationSend.drawId, draw.id)),
  ]);
  return {
    channels,
    eventPast,
    draw,
    assignments: current?.assignments ?? assignmentsForDraw(draw.id),
    guests,
    event,
    logs,
    emails: await guestEmailById(guests),
    templates,
  };
}

function buildInvitationView(state: DeliveryState): InvitationSendView {
  if (!state.draw) return emptyView(state.channels, NO_DRAW_REASON);

  const { channels, eventPast, assignments, guests, event, logs, emails } = state;
  const byGuest = new Map(guests.map((g) => [g.id, g]));
  const nameByAssignment = new Map<number, string>();

  const sentBatches = new Map<number, Set<string>>();
  for (const row of logs) {
    if (row.status !== "sent") continue;
    const set = sentBatches.get(row.assignmentId) ?? new Set();
    set.add(row.batchId);
    sentBatches.set(row.assignmentId, set);
  }

  const pendingRecipients: InvitationRecipient[] = [];
  const pendingUnreachable: InvitationUnreachable[] = [];
  const resendByRound = new Map<number, InvitationRecipient[]>();
  const resendUnreachable: InvitationUnreachable[] = [];
  const emailGuests: Array<{ name: string; language: string }> = [];
  const signalGuests: Array<{ name: string; language: string }> = [];

  const sorted = [...assignments].sort((a, b) => {
    const an = byGuest.get(a.giverId)?.name ?? "";
    const bn = byGuest.get(b.giverId)?.name ?? "";
    return compareNames(an, bn);
  });

  for (const assignment of sorted) {
    const guest = byGuest.get(assignment.giverId);
    if (!guest) continue;
    const email = emails.get(guest.id) ?? null;
    const guestChannels = channelsForGuest(guest, email, channels);
    if (guestChannels.includes("email")) {
      emailGuests.push({ name: guest.name, language: guest.language });
    }
    if (guestChannels.includes("signal")) {
      signalGuests.push({ name: guest.name, language: guest.language });
    }
    const name = guest.name;
    nameByAssignment.set(assignment.id, name);
    const received = alreadyReceived(assignment);
    const recipient: InvitationRecipient = {
      assignmentId: assignment.id,
      name,
      channels: guestChannels,
    };

    if (guestChannels.length === 0) {
      const reason = unreachableReason(guest, email, channels);
      if (!received) {
        pendingUnreachable.push({
          assignmentId: assignment.id,
          name,
          reason,
        });
      }
      resendUnreachable.push({
        assignmentId: assignment.id,
        name,
        reason,
      });
      continue;
    }

    if (!received) pendingRecipients.push(recipient);
    const nextRound = priorRounds(assignment, sentBatches) + 1;
    const roundList = resendByRound.get(nextRound) ?? [];
    roundList.push(recipient);
    resendByRound.set(nextRound, roundList);
  }

  const rounds: InvitationRoundGroup[] = [...resendByRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, roundGuests]) => ({
      round,
      guests: sortRecipients(roundGuests),
    }));

  const hasPriorSend = assignments.some(
    (assignment) => priorRounds(assignment, sentBatches) > 0,
  );
  const missingGenders = missingGenderReason(
    guests
      .filter((guest) => !isGender(guest.gender ?? ""))
      .map((guest) => guest.name)
      .sort(compareNames),
  );
  const missingCases = missingConjugationReason(
    guests
      .filter((guest) => missingNameCases(guest).length > 0)
      .map((guest) => guest.name)
      .sort(compareNames),
  );
  const missingDate = missingEventDateSendReason(event?.occursOn);
  const shownBudget = budgetShownToGuests(state.draw, event);
  const budgetKind = effectiveBudgetKind(shownBudget);
  const missingBudget = budgetKind ? null : MISSING_BUDGET_CHOICE_MESSAGE;
  const missingBudgetSentence =
    budgetKind == null
      ? null
      : missingBudgetSentenceReason(
          budgetKind,
          guests.map((guest) => ({
            name: guest.name,
            language: guest.language,
          })),
          state.templates,
        );
  const missingTranslations = missingEventTranslationsSendReason(event);
  const missingLocation = missingEventLocationSendReason(event);
  const invalidTemplates = invalidTemplatesReason(state.templates);
  const missingEmailTemplates = missingInvitationTemplateReason(
    "email",
    emailGuests,
    state.templates,
  );
  const missingSignalTemplates = missingInvitationTemplateReason(
    "signal",
    signalGuests,
    state.templates,
  );
  const actions = invitationActionState({
    eventPast,
    missingDateReason: missingDate,
    missingGenderReason: missingGenders,
    missingConjugationReason: missingCases,
    missingEventTranslationsReason: missingTranslations,
    missingEventLocationReason: missingLocation,
    invalidTemplatesReason: invalidTemplates,
    missingBudgetReason: missingBudget,
    missingBudgetSentenceReason: missingBudgetSentence,
    missingEmailTemplateReason: missingEmailTemplates,
    missingSignalTemplateReason: missingSignalTemplates,
    activeChannels: channels,
    pendingCount: pendingRecipients.length,
    pendingUnreachableCount: pendingUnreachable.length,
    resendRoundCount: rounds.length,
    hasPriorSend,
  });

  return {
    drawn: true,
    eventPast,
    missingDateReason: missingDate,
    missingGenderReason: missingGenders,
    missingConjugationReason: missingCases,
    missingEventTranslationsReason: missingTranslations,
    missingEventLocationReason: missingLocation,
    invalidTemplatesReason: invalidTemplates,
    missingBudgetReason: missingBudget,
    missingBudgetSentenceReason: missingBudgetSentence,
    missingEmailTemplateReason: missingEmailTemplates,
    missingSignalTemplateReason: missingSignalTemplates,
    channels,
    hasPriorSend,
    pending: {
      ...actions.pending,
      recipients: sortRecipients(pendingRecipients),
      unreachable: pendingUnreachable,
    },
    resend: {
      ...actions.resend,
      rounds,
      unreachable: resendUnreachable,
    },
    history: groupHistory(logs, nameByAssignment),
  };
}

export async function getInvitationSendView(
  eventId: number,
): Promise<InvitationSendView> {
  return buildInvitationView(await loadDeliveryState(eventId));
}

/** Copy the edition choice onto a draw that does not have one yet. */
async function freezeDrawBudget(
  draw: Draw,
  event: Event,
): Promise<Draw> {
  if (hasBudgetChoice(draw)) return draw;
  const shown = budgetShownToGuests(draw, event);
  const kind = effectiveBudgetKind(shown);
  const [updated] = await db
    .update(schema.draw)
    .set({
      budgetKind: kind,
      budget: kind === "amount" ? (shown.budget ?? null) : null,
      currency:
        shown.currency && isCurrency(shown.currency)
          ? shown.currency
          : event.currency,
      budgetEur: kind === "amount" ? (shown.budgetEur ?? null) : null,
      budgetPln: kind === "amount" ? (shown.budgetPln ?? null) : null,
      budgetJpy: kind === "amount" ? (shown.budgetJpy ?? null) : null,
    })
    .where(eq(schema.draw.id, draw.id))
    .returning();
  return mustExist(updated, "Could not update draw.");
}

export async function sendInvitations(
  eventId: number,
  mode: InvitationSendMode,
  selected?: InvitationSendChannels,
): Promise<{ delivery: DeliverySummary }> {
  const state = await loadDeliveryState(eventId);
  if (!state.draw) {
    throw new InvitationSendError(NO_DRAW_REASON);
  }
  if (!state.event) {
    throw new InvitationSendError(MISSING_EVENT_DATE_SEND_REASON);
  }
  const view = selected
    ? applyChannelSelection(buildInvitationView(state), selected)
    : buildInvitationView(state);
  const recipients =
    mode === "pending"
      ? view.pending.recipients
      : view.resend.rounds.flatMap((group) => group.guests);
  if (mode === "pending" && view.pending.disabled) {
    throw new InvitationSendError(
      view.pending.disabledReason ?? "Nothing to send.",
    );
  }
  if (mode === "resend" && view.resend.disabled) {
    throw new InvitationSendError(
      view.resend.disabledReason ?? "Nothing to send.",
    );
  }
  if (recipients.length === 0) {
    throw new InvitationSendError("Nothing to send.");
  }

  state.draw = await freezeDrawBudget(state.draw, state.event);

  const wanted = new Set(recipients.map((r) => r.assignmentId));
  const assignments = state.assignments.filter((a) => wanted.has(a.id));
  const delivery = await deliverAssignments({
    draw: state.draw,
    assignments,
    guests: state.guests,
    channels: view.channels,
    source: mode,
  });
  if (selected) {
    updateDrawChannels(state.draw.id, view.channels);
  }
  return { delivery };
}
