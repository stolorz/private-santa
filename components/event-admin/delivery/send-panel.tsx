"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocalDateTime } from "@/components/ui/local-date-time";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { eventApiPath } from "@/lib/public-path";
import { cn, qty } from "@/lib/utils";
import {
  EVENT_PAST_REASON,
  NO_PRIOR_SEND_REASON,
  applyChannelSelection,
} from "@/lib/invitation-channels";
import {
  INVITATION_CHANNEL_LABEL,
  INVITATION_CHANNEL_ORDER,
  type InvitationChannel,
  type InvitationRecipient,
  type InvitationSendChannels,
  type InvitationSendBatchView,
  type InvitationSendLogRow,
  type InvitationSendStatus,
  type InvitationSendView,
  type InvitationUnreachable,
} from "@/lib/invitation-send-types";

const CHANNEL_LABEL = INVITATION_CHANNEL_LABEL;

const STATUS_LABEL: Record<InvitationSendStatus, string> = {
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12.04 2a9.8 9.8 0 0 0-8.47 14.73L2 22l5.43-1.42A9.8 9.8 0 1 0 12.04 2m5.76 13.99c-.24.68-1.39 1.24-1.92 1.32-.5.07-1.13.1-1.82-.12-.42-.13-.96-.31-1.65-.6-2.88-1.24-4.76-4.15-4.9-4.34-.15-.2-1.17-1.55-1.17-2.96 0-1.4.74-2.09 1-2.38.26-.28.57-.35.76-.35h.55c.18 0 .41-.06.64.49.24.58.81 1.98.88 2.12.07.14.11.31.02.49-.1.19-.14.31-.28.47l-.42.5c-.14.16-.29.29-.12.55.16.27.72 1.19 1.54 1.92 1.06.95 1.96 1.24 2.23 1.38.27.13.43.11.58-.07.16-.19.66-.77.84-1.04.17-.26.35-.22.59-.13.24.09 1.52.72 1.78.85.26.13.43.2.5.31.06.1.06.68-.18 1.36"
      />
    </svg>
  );
}

function SignalGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.26 2 11.5c0 2.92 1.4 5.53 3.58 7.24v3.01c0 .4.43.66.78.47l3.22-1.73c.77.2 1.58.31 2.42.31 5.52 0 10-4.26 10-9.5S17.52 2 12 2m3.66 12.53-1.9 1.9a.97.97 0 0 1-1.38 0l-1.9-1.9a.97.97 0 1 1 1.38-1.38l1.21 1.21 1.21-1.21a.97.97 0 1 1 1.38 1.38"
      />
    </svg>
  );
}

function MailGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 4-8 5-8-5V6l8 5 8-5z"
      />
    </svg>
  );
}

const CHANNEL_ICON = {
  whatsapp: WhatsAppGlyph,
  signal: SignalGlyph,
  email: MailGlyph,
};

function channelIconClass(
  channel: InvitationChannel,
  status: InvitationSendStatus,
): string {
  if (status === "failed") return "text-destructive";
  if (status === "skipped") return "text-muted-foreground/45";
  if (channel === "whatsapp") return "text-[#25D366]";
  if (channel === "signal") return "text-[#3A76F0]";
  return "text-foreground";
}

const SENT_AT_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "short",
  timeStyle: "medium",
};

function channelList(channels: InvitationChannel[]): string {
  return channels.map((c) => CHANNEL_LABEL[c]).join(", ");
}

function groupHistoryGuests(rows: InvitationSendLogRow[]): Array<{
  assignmentId: number;
  name: string;
  createdAt: string;
  channels: InvitationSendLogRow[];
}> {
  const groups: Array<{
    assignmentId: number;
    name: string;
    createdAt: string;
    channels: InvitationSendLogRow[];
  }> = [];
  const indexByAssignment = new Map<number, number>();
  for (const row of rows) {
    const existing = indexByAssignment.get(row.assignmentId);
    if (existing != null) {
      const group = groups[existing]!;
      group.channels.push(row);
      if (row.createdAt > group.createdAt) group.createdAt = row.createdAt;
      continue;
    }
    indexByAssignment.set(row.assignmentId, groups.length);
    groups.push({
      assignmentId: row.assignmentId,
      name: row.name,
      createdAt: row.createdAt,
      channels: [row],
    });
  }
  return groups;
}

function flattenHistoryGuests(history: InvitationSendBatchView[]) {
  return history.flatMap((batch) =>
    groupHistoryGuests(batch.rows).map((guest) => ({
      key: `${batch.batchId}-${guest.assignmentId}`,
      ...guest,
    })),
  );
}

function ChannelStatusIcon({ row }: { row: InvitationSendLogRow }) {
  const Icon = CHANNEL_ICON[row.channel];
  const label = `${CHANNEL_LABEL[row.channel]} · ${STATUS_LABEL[row.status]}${
    row.error ? ` — ${row.error}` : ""
  }`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-md",
            channelIconClass(row.channel, row.status),
          )}
          aria-label={label}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function guestCount(n: number): string {
  return qty(n, "guest", "guests");
}

function invitationRoundLabel(round: number): string {
  if (round === 1) return "first";
  if (round === 2) return "second";
  if (round === 3) return "third";
  const mod100 = round % 100;
  const mod10 = round % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${round}th`;
  if (mod10 === 1) return `${round}st`;
  if (mod10 === 2) return `${round}nd`;
  if (mod10 === 3) return `${round}rd`;
  return `${round}th`;
}

function ChannelOverview({
  configured,
  selected,
}: {
  configured: InvitationSendChannels;
  selected: InvitationSendChannels;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Each guest will receive their private link on every selected channel
        they can actually receive.
      </p>
      <ul className="list-inside list-disc text-sm text-muted-foreground">
        {INVITATION_CHANNEL_ORDER.map((channel) => {
          const detail = !configured[channel]
            ? " — not configured, skipped"
            : !selected[channel]
              ? " — not selected, skipped"
              : channel === "email"
                ? " — sends to guests with an email address"
                : " — sends to guests with a phone number";
          return (
            <li key={channel}>
              {CHANNEL_LABEL[channel]}
              {detail}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecipientList({
  recipients,
}: {
  recipients: InvitationRecipient[];
}) {
  if (recipients.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {recipients.map((r) => (
        <li
          key={r.assignmentId}
          className="rounded-md border px-3 py-2"
        >
          <span className="font-medium">{r.name}</span>
          <span className="text-muted-foreground">
            {" "}
            — {channelList(r.channels)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UnreachableList({
  people,
}: {
  people: InvitationUnreachable[];
}) {
  if (people.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">
        {guestCount(people.length)} cannot be reached:
      </p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {people.map((p) => (
          <li key={p.assignmentId} className="rounded-md border px-3 py-2">
            <span className="font-medium text-foreground">{p.name}</span>
            {" — "}
            {p.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DisabledCard({
  disabled,
  reason,
  children,
}: {
  disabled: boolean;
  reason: string | null;
  children: React.ReactNode;
}) {
  const card = (
    <Card className={cn(disabled && "opacity-50")}>{children}</Card>
  );
  if (!disabled || !reason) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-not-allowed" tabIndex={0}>
          {card}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function SendPanel({
  code,
  view,
  selectedChannels,
}: {
  code: string;
  view: InvitationSendView;
  selectedChannels: InvitationSendChannels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"pending" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = applyChannelSelection(view, selectedChannels);

  async function send(mode: "pending" | "resend") {
    const blocked =
      mode === "pending" ? active.pending.disabled : active.resend.disabled;
    if (blocked) return;
    setBusy(mode);
    setError(null);
    const result = await requestJson(eventApiPath(code, "/send"), {
      method: "POST",
      ...jsonBody({ mode, channels: selectedChannels }),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const pendingCount = active.pending.recipients.length;
  const resendCount = active.resend.rounds.reduce(
    (n, group) => n + group.guests.length,
    0,
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <DisabledCard
          disabled={active.pending.disabled}
          reason={active.pending.disabledReason}
        >
          <CardHeader>
            <CardTitle>Invite remaining</CardTitle>
            <CardDescription>
              Send private links to guests who have not received an invitation
              yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChannelOverview
              configured={view.channels}
              selected={selectedChannels}
            />
            {active.invalidTemplatesReason ? (
              <p className="text-sm text-destructive">
                {active.invalidTemplatesReason}
              </p>
            ) : null}
            {active.missingDateReason ? (
              <p className="text-sm text-muted-foreground">
                {active.missingDateReason}
              </p>
            ) : active.eventPast ? (
              <p className="text-sm text-muted-foreground">
                {EVENT_PAST_REASON}
              </p>
            ) : !active.drawn ? (
              <p className="text-sm text-muted-foreground">
                Run the draw before sending invitations.
              </p>
            ) : pendingCount > 0 ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {guestCount(pendingCount)} will get an invitation:
                </p>
                <RecipientList recipients={active.pending.recipients} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No guests are waiting for a first invitation.
              </p>
            )}
            <UnreachableList people={active.pending.unreachable} />
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              type="button"
              disabled={active.pending.disabled || busy !== null}
              onClick={() => send("pending")}
            >
              {busy === "pending" ? "Sending…" : "Send now"}
            </Button>
          </CardFooter>
        </DisabledCard>

        <DisabledCard
          disabled={active.resend.disabled}
          reason={active.resend.disabledReason}
        >
          <CardHeader>
            <CardTitle>Resend to everyone</CardTitle>
            <CardDescription>
              Invitations will be sent again to every guest in this draw. Some
              of them may already have received a link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChannelOverview
              configured={view.channels}
              selected={selectedChannels}
            />
            {active.invalidTemplatesReason ? (
              <p className="text-sm text-destructive">
                {active.invalidTemplatesReason}
              </p>
            ) : null}
            {active.missingDateReason ? (
              <p className="text-sm text-muted-foreground">
                {active.missingDateReason}
              </p>
            ) : active.eventPast ? (
              <p className="text-sm text-muted-foreground">
                {EVENT_PAST_REASON}
              </p>
            ) : !active.drawn ? (
              <p className="text-sm text-muted-foreground">
                Run the draw before sending invitations.
              </p>
            ) : active.resend.disabledReason === NO_PRIOR_SEND_REASON ? (
              <p className="text-sm text-muted-foreground">
                {NO_PRIOR_SEND_REASON}
              </p>
            ) : resendCount > 0 ? (
              <div className="space-y-3">
                <p className="text-sm">
                  {guestCount(resendCount)} will get{" "}
                  {resendCount === 1 ? "an invitation" : "invitations"}.
                </p>
                {active.resend.rounds.map((group) => (
                  <div key={group.round} className="space-y-2">
                    <p className="text-sm">
                      {guestCount(group.guests.length)} will get an invitation
                      for the {invitationRoundLabel(group.round)} time:
                    </p>
                    <RecipientList recipients={group.guests} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nobody in this draw can be reached on a selected channel.
              </p>
            )}
            <UnreachableList people={active.resend.unreachable} />
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              type="button"
              disabled={active.resend.disabled || busy !== null}
              onClick={() => send("resend")}
            >
              {busy === "resend" ? "Sending…" : "Send now"}
            </Button>
          </CardFooter>
        </DisabledCard>

        <Card>
          <CardHeader>
            <CardTitle>Send history</CardTitle>
            <CardDescription>
              Every invitation attempt and its result.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invitations have been sent yet.
              </p>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)_auto_auto] rounded-md border">
                {flattenHistoryGuests(view.history).map((guest) => {
                  const problems = guest.channels.filter(
                    (row) => row.status !== "sent",
                  );
                  const byChannel = new Map(
                    guest.channels.map((row) => [row.channel, row]),
                  );
                  return (
                    <li
                      key={guest.key}
                      className="col-span-3 grid grid-cols-subgrid items-center gap-x-2 border-b px-3 py-2 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {guest.name}
                      </span>
                      <LocalDateTime
                        className="whitespace-nowrap text-right text-xs text-muted-foreground tabular-nums"
                        value={guest.createdAt}
                        options={SENT_AT_FORMAT}
                      />
                      <span className="flex items-center justify-end">
                        {INVITATION_CHANNEL_ORDER.map((channel) => {
                          const row = byChannel.get(channel);
                          if (!row) {
                            return (
                              <span
                                key={channel}
                                className="size-6"
                                aria-hidden
                              />
                            );
                          }
                          return (
                            <ChannelStatusIcon key={channel} row={row} />
                          );
                        })}
                      </span>
                      {problems.map((row) => (
                        <p
                          key={row.channel}
                          className={cn(
                            "col-span-3 text-xs",
                            row.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {CHANNEL_LABEL[row.channel]}{" "}
                          {STATUS_LABEL[row.status].toLowerCase()}
                          {row.error ? ` — ${row.error}` : ""}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </TooltipProvider>
  );
}
