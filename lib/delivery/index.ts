import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  Draw,
  GuestView,
  InvitationChannel,
  InvitationSendStatus,
  InvitationSource,
} from "@/lib/db/schema";
import { budgetShownToGuests } from "@/lib/budget";
import { getEventById } from "@/lib/events";
import { eventLocationFrom } from "@/lib/event-location";
import { eventNameFieldsFrom } from "@/lib/event-name";
import type { DeliverySummary, InvitationSendChannels } from "@/lib/invitation-send-types";
import { guestEmailById } from "@/lib/people";
import { appBaseUrl, guestPortalUrl } from "@/lib/public-path";
import { getEventTemplates } from "@/lib/templates/store";
import {
  CHANNELS,
  type ChannelAttempt,
  type ChannelWrite,
  type DeliverableAssignment,
  type RenderContext,
} from "@/lib/delivery/channels";

export type { DeliverableAssignment };
export {
  CHANNELS,
  channelsForGuest,
  configuredInvitationChannels,
  unconfiguredDeliveryError,
  unreachableReason,
} from "@/lib/delivery/channels";
export type { DeliverySummary };

type InvitationLogRow = {
  drawId: number;
  assignmentId: number;
  batchId: string;
  source: InvitationSource;
  channel: InvitationChannel;
  status: InvitationSendStatus;
  error: string | null;
};

type ChannelOutcome = {
  summary: { sent: number; failed: number; errors?: string[] } | null;
  attempts: ChannelAttempt[];
  writes: ChannelWrite[];
};

async function deliverVia(
  adapter: (typeof CHANNELS)[number],
  rows: DeliverableAssignment[],
  byId: Map<number, GuestView>,
  emails: Map<number, string>,
  ctx: RenderContext & { base: string },
): Promise<ChannelOutcome> {
  const queued: Parameters<typeof adapter.send>[0] = [];
  const attempts: ChannelAttempt[] = [];
  for (const row of rows) {
    const giver = byId.get(row.giverId);
    if (!giver) continue;
    const to = adapter.addressFor(giver, emails.get(row.giverId) ?? null);
    if (!to) {
      attempts.push({
        assignment: row,
        giverId: row.giverId,
        status: "skipped",
        error: adapter.missingAddress(giver.name),
      });
      continue;
    }
    queued.push({
      assignment: row,
      guest: giver,
      to,
      url: guestPortalUrl(ctx.base, row.revealToken),
    });
  }

  const results = queued.length === 0 ? [] : await adapter.send(queued, ctx);
  for (let i = 0; i < queued.length; i++) {
    const result = results[i];
    const item = queued[i];
    if (result?.ok) {
      attempts.push({
        assignment: item.assignment,
        giverId: item.assignment.giverId,
        status: "sent",
        error: null,
      });
      continue;
    }
    const fallback = adapter.needs === "email" ? "SMTP send failed" : "send failed";
    const error =
      adapter.needs === "email"
        ? (result?.error ?? fallback)
        : result?.error
          ? `${result.to}: ${result.error}`
          : `${result?.to ?? "unknown"}: ${fallback}`;
    attempts.push({
      assignment: item.assignment,
      giverId: item.assignment.giverId,
      status: "failed",
      error,
    });
  }

  const sent = attempts.filter((attempt) => attempt.status === "sent");
  const failed = attempts.filter((attempt) => attempt.status === "failed");
  const skipped = attempts.filter((attempt) => attempt.status === "skipped");
  const failedCount = adapter.countSkippedAsFailed
    ? failed.length + skipped.length
    : failed.length;
  const summary =
    adapter.needs === "email" && queued.length === 0
      ? null
      : {
          sent: sent.length,
          failed: failedCount,
          errors: [...skipped, ...failed].flatMap((attempt) =>
            attempt.error ? [attempt.error] : [],
          ),
        };

  return {
    summary,
    attempts,
    writes: adapter.patches(attempts),
  };
}

function persistDelivery(
  drawId: number,
  writes: ChannelWrite[],
  logRows: InvitationLogRow[],
) {
  db.transaction((tx) => {
    for (const write of writes) {
      if (write.giverIds.length > 0) {
        tx.update(schema.assignment)
          .set(write.set)
          .where(
            and(
              eq(schema.assignment.drawId, drawId),
              inArray(schema.assignment.giverId, write.giverIds),
            ),
          )
          .run();
      }
    }
    if (logRows.length) {
      tx.insert(schema.invitationSend).values(logRows).run();
    }
  });
}

/**
 * Deliver private guest links on the requested channels (when those
 * integrations are configured), mark assignment flags, and append
 * invitation_send rows. Called from the Delivery tab (`sendInvitations`).
 */
export async function deliverAssignments(opts: {
  draw: Draw;
  assignments: DeliverableAssignment[];
  guests: GuestView[];
  channels: InvitationSendChannels;
  source: InvitationSource;
}): Promise<DeliverySummary> {
  const { draw, assignments, guests, channels, source } = opts;
  const delivery: DeliverySummary = {
    whatsapp: null,
    signal: null,
    email: null,
  };
  if (assignments.length === 0) return delivery;

  const byId = new Map(guests.map((guest) => [guest.id, guest]));
  const [templates, eventRow, emails] = await Promise.all([
    getEventTemplates(draw.eventId),
    getEventById(draw.eventId),
    guestEmailById(guests),
  ]);
  const ctx: RenderContext & { base: string } = {
    templates,
    event: eventNameFieldsFrom(eventRow, draw.name),
    occursOn: eventRow?.occursOn ?? "",
    location: eventLocationFrom(eventRow),
    amounts: budgetShownToGuests(draw, eventRow),
    guestCount: guests.length,
    base: appBaseUrl(),
  };

  const active = CHANNELS.filter((channel) => channels[channel.id]);
  const ready = await Promise.all(
    active.map(async (channel) => ({
      channel,
      configured: await channel.isConfigured(),
    })),
  );
  const outcomes = await Promise.all(
    ready
      .filter((item) => item.configured)
      .map(async ({ channel }) => ({
        channel,
        outcome: await deliverVia(channel, assignments, byId, emails, ctx),
      })),
  );

  const writes: ChannelWrite[] = [];
  const logRows: InvitationLogRow[] = [];
  const batchId = randomUUID();

  for (const { channel, outcome } of outcomes) {
    writes.push(...outcome.writes);
    for (const attempt of outcome.attempts) {
      logRows.push({
        drawId: draw.id,
        assignmentId: attempt.assignment.id,
        batchId,
        source,
        channel: channel.id,
        status: attempt.status,
        error: attempt.error,
      });
    }
    if (channel.id === "email") {
      delivery.email = outcome.summary
        ? { sent: outcome.summary.sent, failed: outcome.summary.failed }
        : null;
    } else {
      delivery[channel.id] = {
        sent: outcome.summary?.sent ?? 0,
        failed: outcome.summary?.failed ?? 0,
        errors: outcome.summary?.errors ?? [],
      };
    }
  }

  persistDelivery(draw.id, writes, logRows);
  return delivery;
}
