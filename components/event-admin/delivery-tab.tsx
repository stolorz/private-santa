"use client";

import { useState } from "react";
import type { CurrentDrawView } from "@/components/event-admin/types";
import { SwitchRow } from "@/components/ui/switch-row";
import { SendPanel } from "@/components/event-admin/delivery/send-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { IntegrationsView } from "@/lib/integrations-types";
import type { InvitationChannel } from "@/lib/db/schema";
import {
  fromDeliverFlags,
  INVITATION_CHANNEL_LABEL,
  INVITATION_CHANNEL_ORDER,
  toDeliverFlags,
  type InvitationSendChannels,
  type InvitationSendView,
} from "@/lib/invitation-send-types";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { eventApiPath } from "@/lib/public-path";

export function DeliveryTab({
  code,
  integrations,
  invitationSend,
  currentDraw,
}: {
  code: string;
  integrations: IntegrationsView;
  invitationSend: InvitationSendView;
  currentDraw: CurrentDrawView | null;
}) {
  const [channels, setChannels] = useState<InvitationSendChannels>(() =>
    currentDraw
      ? fromDeliverFlags(currentDraw.draw)
      : { whatsapp: false, signal: false, email: false },
  );
  const [channelError, setChannelError] = useState<string | null>(null);

  async function persistDeliveryChannels(next: InvitationSendChannels) {
    setChannels(next);
    if (!currentDraw) return;
    const result = await requestJson(eventApiPath(code, "/draw"), {
      method: "PATCH",
      ...jsonBody(toDeliverFlags(next)),
    });
    setChannelError(result.ok ? null : result.error);
  }

  return (
    <div className="space-y-6">
      <DeliveryChannelsCard
        integrations={integrations}
        channels={channels}
        onChange={(next) => void persistDeliveryChannels(next)}
        error={channelError}
      />
      <SendPanel
        code={code}
        view={invitationSend}
        selectedChannels={channels}
      />
    </div>
  );
}

function channelConfigured(
  integrations: IntegrationsView,
  channel: InvitationChannel,
): boolean {
  return integrations[channel].configured;
}

function DeliveryChannelsCard({
  integrations,
  channels,
  onChange,
  error,
}: {
  integrations: IntegrationsView;
  channels: InvitationSendChannels;
  onChange: (next: InvitationSendChannels) => void;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery channels</CardTitle>
        <CardDescription>
          Any combination. The reveal page is always generated. Selected
          channels are used when you send invitations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {INVITATION_CHANNEL_ORDER.map((channel) => {
            const configured = channelConfigured(integrations, channel);
            return (
              <SwitchRow
                key={channel}
                title={INVITATION_CHANNEL_LABEL[channel]}
                description={
                  configured
                    ? "Sends each guest their private link"
                    : "Not configured — set up under Settings"
                }
                checked={channels[channel] && configured}
                onCheckedChange={(on) =>
                  onChange({ ...channels, [channel]: on })
                }
                disabled={!configured}
              />
            );
          })}
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
