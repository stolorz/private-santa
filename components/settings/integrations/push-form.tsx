"use client";

import { useState, type FormEvent } from "react";
import {
  getActivePushSubscription,
  PushToggle,
  waitForTestPush,
} from "@/components/events/push-toggle";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IntegrationSection } from "@/components/settings/integrations/integration-section";
import {
  postTest,
  TestResult,
} from "@/components/settings/integrations/test-result";
import {
  useIntegrationSection,
  type IntegrationFormProps,
} from "@/components/settings/integrations/use-integration-section";
import { requestJson } from "@/lib/fetch-json";
import type { IntegrationsView } from "@/lib/integrations-types";
import { apiPath } from "@/lib/public-path";

export function PushForm({ view, onSaved }: IntegrationFormProps) {
  const push = view.push;
  const [subject, setSubject] = useState(push.subject);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const { save, clear, busy, saved, error, setError, setSaved } =
    useIntegrationSection("push", { subject });
  const locked = busy || generating;

  async function onSubmit(e: FormEvent) {
    const next = await save(e);
    if (!next) return;
    setSubject(next.push.subject);
    onSaved(next);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    const result = await requestJson<IntegrationsView>(
      apiPath("/api/settings/integrations/push"),
      { method: "POST" },
    );
    if (!result.ok) {
      setError(result.error || "Could not generate keys.");
    } else {
      setSubject(result.data.push.subject);
      onSaved(result.data);
      setSaved(true);
    }
    setGenerating(false);
  }

  async function onClear() {
    const next = await clear();
    if (!next) return;
    setSubject(next.push.subject);
    onSaved(next);
  }

  async function sendTest() {
    setSending(true);
    setTestError(null);
    setTestOk(null);
    let delivered: ReturnType<typeof waitForTestPush> | null = null;
    try {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        throw new Error("Enable push notifications on this device first.");
      }
      const sub = await getActivePushSubscription();
      if (!sub) {
        throw new Error("Enable push notifications on this device first.");
      }
      delivered = waitForTestPush();
      await postTest(
        "/api/settings/integrations/push/test",
        { endpoint: sub.endpoint },
      );
      const ack = await delivered.promise;
      if (!ack.received) {
        throw new Error(
          "The push service accepted the message, but it never reached this browser's service worker. Try Disable → Enable push notifications to refresh the subscription.",
        );
      }
      if (!ack.shown) {
        throw new Error(
          ack.error || "Push reached this browser, but showing the notification failed.",
        );
      }
      setTestOk(
        "Delivered to this browser via Web Push. If no banner popped up, check macOS Notification Center → your browser (Alerts + Allow notifications).",
      );
    } catch (e) {
      delivered?.cancel();
      setTestError(e instanceof Error ? e.message : "Could not send test.");
    } finally {
      setSending(false);
    }
  }

  return (
    <IntegrationSection
      title="Push (Web Push)"
      configured={push.configured}
      description={
        <>
          Generate a VAPID key pair for this server. Then enable
          notifications below and send a test to confirm delivery when a
          guest opens a link or unwraps a name.
        </>
      }
    >
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <Field
        id="push-subject"
        label="Subject"
        hint="A mailto: contact shown to push services."
      >
        <Input
          id="push-subject"
          type="text"
          value={subject}
          dirty={subject !== push.subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setSaved(false);
          }}
          placeholder="mailto:you@example.com"
        />
      </Field>
      {push.publicKey && (
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          Public key: {push.publicKey}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={locked}>
          {saved ? "Saved ✓" : "Save subject"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={() => void generate()}
        >
          {generating
            ? "Generating…"
            : push.configured
              ? "Regenerate keys"
              : "Generate keys"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={() => void onClear()}
        >
          Clear
        </Button>
      </div>
      {push.configured && (
        <div className="space-y-2 rounded-md border p-3">
          <PushToggle publicKey={push.publicKey} />
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={() => void sendTest()}
          >
            {sending ? "Sending…" : "Send test"}
          </Button>
          <TestResult ok={testOk} error={testError} />
        </div>
      )}
    </form>
    </IntegrationSection>
  );
}
