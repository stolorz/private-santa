"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmailForm } from "@/components/settings/integrations/email-form";
import { PushForm } from "@/components/settings/integrations/push-form";
import { SignalForm } from "@/components/settings/integrations/signal-form";
import { WhatsAppForm } from "@/components/settings/integrations/whatsapp-form";
import type { IntegrationsView } from "@/lib/integrations-types";

export function IntegrationsSettings({ initial }: { initial: IntegrationsView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);

  const apply = useCallback(
    (next: IntegrationsView, refresh = true) => {
      setView(next);
      if (refresh) router.refresh();
    },
    [router],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Saved on this server. Environment variables are used when a field
          is left empty. Delivery only fires for channels you enable on a
          draw.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <WhatsAppForm view={view} onSaved={apply} />
        <EmailForm view={view} onSaved={apply} />
        <PushForm view={view} onSaved={apply} />
        <SignalForm view={view} onSaved={apply} />
      </CardContent>
    </Card>
  );
}
