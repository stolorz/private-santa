"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export function EmailForm({ view, onSaved }: IntegrationFormProps) {
  const email = view.email;
  const [host, setHost] = useState(email.host);
  const [port, setPort] = useState(email.port);
  const [user, setUser] = useState(email.user);
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState(email.from);
  const [imapHost, setImapHost] = useState(email.imapHost);
  const [imapPort, setImapPort] = useState(email.imapPort);
  const [testTo, setTestTo] = useState(email.testTo);
  const [testing, setTesting] = useState(false);
  const [draftTo, setDraftTo] = useState(email.testTo);
  const [sending, setSending] = useState(false);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const { save, clear, busy, saved, error, setSaved } = useIntegrationSection(
    "email",
    { host, port, user, password, from, imapHost, imapPort },
  );

  function applyEmail(next: typeof email) {
    setHost(next.host);
    setPort(next.port);
    setUser(next.user);
    setFrom(next.from);
    setImapHost(next.imapHost);
    setImapPort(next.imapPort);
    setPassword("");
    setTestTo(next.testTo);
  }

  async function onSubmit(e: FormEvent) {
    const next = await save(e);
    if (!next) return;
    applyEmail(next.email);
    onSaved(next);
  }

  async function onClear() {
    const next = await clear();
    if (!next) return;
    applyEmail(next.email);
    onSaved(next);
  }

  function openTest() {
    setDraftTo(testTo);
    setTestError(null);
    setTesting(true);
  }

  async function sendTest(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setTestOk(null);
    setTestError(null);
    try {
      const json = await postTest<{ ok?: boolean; to?: string; error?: string }>(
        "/api/settings/integrations/email/test",
        { to: draftTo },
        "Could not send the test email.",
      );
      const to =
        typeof json.to === "string" && json.to ? json.to : draftTo.trim();
      setTestTo(to);
      setDraftTo(to);
      setTestOk(`Sent to ${to}.`);
      setTesting(false);
    } catch (err) {
      setTestError(
        err instanceof Error ? err.message : "Could not send the test email.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <IntegrationSection
      title="Email"
      configured={email.configured}
      description={
        <>
          Sends draw links through this mailbox (SMTP). Incoming bounce mail
          is read over IMAP so failed deliveries show on the guest list.
        </>
      }
    >
    <div className="space-y-3">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <Field id="email-host" label="SMTP host">
        <Input
          id="email-host"
          value={host}
          dirty={host !== email.host}
          onChange={(e) => {
            setHost(e.target.value);
            setSaved(false);
          }}
          placeholder="smtp.your.domain"
          autoComplete="off"
        />
      </Field>
      <Field id="email-port" label="SMTP port" hint="587 (STARTTLS) or 465 (SSL).">
        <Input
          id="email-port"
          inputMode="numeric"
          value={port}
          dirty={port !== email.port}
          onChange={(e) => {
            setPort(e.target.value);
            setSaved(false);
          }}
          placeholder="587"
        />
      </Field>
      <Field id="email-user" label="Username" hint="Usually the mailbox address.">
        <Input
          id="email-user"
          value={user}
          dirty={user !== email.user}
          onChange={(e) => {
            setUser(e.target.value);
            setSaved(false);
          }}
          placeholder="santa@your.domain"
          autoComplete="off"
        />
      </Field>
      <Field
        id="email-password"
        label="Password"
        hint={
          email.passwordSet
            ? "Leave blank to keep the current password."
            : "Mailbox password for SMTP and IMAP."
        }
      >
        <Input
          id="email-password"
          type="password"
          autoComplete="off"
          value={password}
          dirty={password !== ""}
          onChange={(e) => {
            setPassword(e.target.value);
            setSaved(false);
          }}
          placeholder={email.passwordSet ? "••••••••" : ""}
        />
      </Field>
      <Field id="email-from" label="From">
        <Input
          id="email-from"
          value={from}
          dirty={from !== email.from}
          onChange={(e) => {
            setFrom(e.target.value);
            setSaved(false);
          }}
          placeholder="Private Santa <santa@your.domain>"
        />
      </Field>
      <Field
        id="email-imap-host"
        label="IMAP host"
        hint="Bounce reading stays off until an IMAP host is saved."
      >
        <Input
          id="email-imap-host"
          value={imapHost}
          dirty={imapHost !== email.imapHost}
          onChange={(e) => {
            setImapHost(e.target.value);
            setSaved(false);
          }}
          placeholder="same as SMTP host"
          autoComplete="off"
        />
      </Field>
      <Field id="email-imap-port" label="IMAP port">
        <Input
          id="email-imap-port"
          inputMode="numeric"
          value={imapPort}
          dirty={imapPort !== email.imapPort}
          onChange={(e) => {
            setImapPort(e.target.value);
            setSaved(false);
          }}
          placeholder="993"
        />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {saved ? "Saved ✓" : busy ? "Saving…" : "Save email"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !email.configured || sending}
          onClick={openTest}
        >
          Send test
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void onClear()}
        >
          Clear
        </Button>
      </div>
      <TestResult ok={testOk} error={testing ? null : testError} />
      </form>
      <Dialog open={testing} onOpenChange={setTesting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>
              We will send a short message to this address to confirm the
              mailbox can deliver.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void sendTest(e)} className="space-y-3">
            <Field id="email-test-to" label="Send to">
              <Input
                id="email-test-to"
                type="email"
                required
                autoComplete="email"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            {testError && (
              <p className="text-sm text-destructive">{testError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={() => setTesting(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={sending || !draftTo.trim()}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </IntegrationSection>
  );
}
