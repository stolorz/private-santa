"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IntegrationSection } from "@/components/settings/integrations/integration-section";
import {
  postTest,
  TestResult,
} from "@/components/settings/integrations/test-result";
import type { IntegrationFormProps } from "@/components/settings/integrations/use-integration-section";
import { requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import type { IntegrationsView } from "@/lib/integrations-types";
import { apiPath } from "@/lib/public-path";

const NOTE_TO_SELF = "self";

async function fetchSignalContacts(sync: boolean) {
  const path = apiPath("/api/settings/integrations/signal/contacts");
  const result = await requestJson<{ contacts?: { id: string; label: string }[] }>(
    sync ? `${path}?sync=1` : path,
  );
  if (!result.ok) {
    throw new Error(result.error || "Could not load contacts.");
  }
  return Array.isArray(result.data?.contacts) ? result.data.contacts : [];
}

export function SignalForm({ view, onSaved }: IntegrationFormProps) {
  const signal = view.signal;
  const request = useCallback(
    (method: "POST" | "DELETE") =>
      requestJson<IntegrationsView>(
        apiPath("/api/settings/integrations/signal"),
        { method },
      ),
    [],
  );
  const { run, busy, error } = useMutation(request);

  useEffect(() => {
    if (!signal.linking && !signal.preparing) return;
    const timer = setInterval(() => {
      void (async () => {
        const result = await requestJson<IntegrationsView>(
          apiPath("/api/settings/integrations/signal"),
        );
        if (!result.ok) return;
        const next = result.data;
        const done =
          next.signal.configured ||
          (!next.signal.linking && !next.signal.preparing);
        onSaved(next, done);
      })();
    }, 2000);
    return () => clearInterval(timer);
  }, [signal.linking, signal.preparing, onSaved]);

  async function onStart() {
    const result = await run("POST");
    if (result.ok) onSaved(result.data);
  }

  async function onUnlink() {
    const result = await run("DELETE");
    if (result.ok) onSaved(result.data);
  }

  return (
    <IntegrationSection
      title="Signal"
      configured={signal.configured}
      defaultOpen={signal.linking || signal.preparing}
      description="Links this app as a secondary device on the organiser's private Signal. On your phone: Signal → Settings → Linked devices → Link new device, then scan the QR code."
    >
    <div className="space-y-3">
      {signal.configured && signal.accountNumber && (
        <p className="text-xs text-muted-foreground">
          Linked as {signal.accountNumber}
        </p>
      )}
      {signal.configured && <SignalTestSend />}
      {signal.preparing && !signal.qrDataUrl && (
        <p className="text-xs text-muted-foreground">
          Preparing the Signal client…
        </p>
      )}
      {signal.linking && !signal.preparing && (
        <div className="flex flex-col items-start gap-3 rounded-md border p-3">
          {signal.qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signal.qrDataUrl}
              alt="Signal linking QR code"
              className="size-48 rounded bg-white p-2"
            />
          ) : null}
          {signal.linkUrl && (
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              {signal.linkUrl}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Waiting for the phone to confirm…
          </p>
        </div>
      )}
      {signal.error && (
        <p className="text-sm text-destructive">{signal.error}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {!signal.configured && (
          <Button
            type="button"
            disabled={busy || signal.linking || signal.preparing}
            onClick={() => void onStart()}
          >
            {busy
              ? "Starting…"
              : signal.preparing
                ? "Preparing…"
                : signal.linking
                  ? "Waiting…"
                  : "Link device"}
          </Button>
        )}
        {(signal.configured || signal.linking) && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void onUnlink()}
          >
            Unlink
          </Button>
        )}
      </div>
    </div>
    </IntegrationSection>
  );
}

function SignalTestSend() {
  const [to, setTo] = useState(NOTE_TO_SELF);
  const [contacts, setContacts] = useState<{ id: string; label: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const first = await fetchSignalContacts(false);
        if (cancelled) return;
        setContacts(first);
        setLoading(false);
        if (first.length > 0) return;
        setSyncing(true);
        const synced = await fetchSignalContacts(true);
        if (!cancelled) setContacts(synced);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load contacts.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSyncing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setSyncing(true);
    setError(null);
    try {
      setContacts(await fetchSignalContacts(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load contacts.");
    } finally {
      setSyncing(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    setOk(null);
    try {
      await postTest("/api/settings/integrations/signal/test", { to });
      const label =
        to === NOTE_TO_SELF
          ? "Note to Self"
          : (contacts.find((c) => c.id === to)?.label ?? to);
      setOk(`Sent to ${label}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send test.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">
        Send a test to Note to Self or a contact to confirm delivery.
        Contacts appear after Signal has synced.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={to} onValueChange={setTo} disabled={sending}>
          <SelectTrigger aria-label="Test recipient" className="sm:min-w-56">
            <SelectValue placeholder="Choose a recipient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOTE_TO_SELF}>Note to Self</SelectItem>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={sending}
          onClick={() => void send()}
        >
          {sending ? "Sending…" : "Send test"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={sending || syncing || loading}
          onClick={() => void refresh()}
        >
          Refresh contacts
        </Button>
      </div>
      {loading && !syncing && (
        <p className="text-xs text-muted-foreground">Loading contacts…</p>
      )}
      {syncing && (
        <p className="text-xs text-muted-foreground">
          Syncing contacts from your phone…
        </p>
      )}
      <TestResult ok={ok} error={error} />
    </div>
  );
}
