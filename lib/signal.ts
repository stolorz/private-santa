import "server-only";
import { SignalUnlinkedError } from "@/lib/errors";
import { toE164 } from "@/lib/phone";
import type { PhoneMessage, SendResult } from "@/lib/phone-send";
import {
  GOSIGNAL_EXIT_UNLINKED,
  parseContactsJson,
  parseSendJson,
  runGoSignal,
  type RunResult,
} from "@/lib/go-signal";
import { noteDeviceUnlinked } from "@/lib/signal-link";
import { isSignalConfigured } from "@/lib/signal-store";

/**
 * Signal delivery via the go-signal CLI (static binary, linked device).
 * There is no official Signal Cloud API. Link the organiser's private
 * number as a secondary device from Settings → Integrations (or
 * `npm run signal:link`); protocol state lives under SIGNAL_STORE_DIR
 * (default `data/signal`).
 *
 * Recipients are stored phone numbers (digits only) and sent as E.164.
 */

export { isSignalConfigured } from "@/lib/signal-store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SendInput = PhoneMessage;
export type { SendResult };

const SIGNAL_NOTE_TO_SELF = "self";
export const SIGNAL_TEST_MESSAGE =
  "Secret Santa test: Signal is linked and sending.";

export interface SignalContact {
  /** go-signal recipient: `self`, E.164, or ACI. */
  id: string;
  label: string;
  number?: string;
}

function messageText(input: SendInput): string {
  if (input.text) return input.text;
  return `Hi ${input.giverName}! Open your private link: ${input.secondParam}`;
}

function recipientOf(to: string): string {
  if (UUID_RE.test(to)) return to;
  return toE164(to);
}

export { SignalUnlinkedError };

function unlinkedMessage(): string {
  return new SignalUnlinkedError().message;
}

function requireConfigured(): void {
  if (!isSignalConfigured()) {
    throw new Error("Signal not configured: run `npm run signal:link` first.");
  }
}

/** Map a UI/API recipient to a go-signal send target, or null if invalid. */
function resolveSignalRecipient(to: string): string | null {
  const trimmed = to.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === SIGNAL_NOTE_TO_SELF) return SIGNAL_NOTE_TO_SELF;
  if (UUID_RE.test(trimmed)) return trimmed;
  if (/^\+\d{8,20}$/.test(trimmed)) return trimmed;
  if (/^\d{8,20}$/.test(trimmed)) return toE164(trimmed);
  return null;
}

async function runSignal(
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<RunResult> {
  const result = await runGoSignal(args, opts);
  if (result.code === GOSIGNAL_EXIT_UNLINKED) {
    noteDeviceUnlinked(unlinkedMessage());
  }
  return result;
}

function throwIfUnlinked(result: RunResult): void {
  if (result.code === GOSIGNAL_EXIT_UNLINKED) {
    throw new SignalUnlinkedError();
  }
}

async function sendToRecipient(
  to: string,
  recipient: string,
  text: string,
): Promise<SendResult> {
  try {
    const result = await runSignal(
      ["-o", "json", "send", recipient, "-m", text],
      { timeoutMs: 60_000 },
    );
    if (result.code === GOSIGNAL_EXIT_UNLINKED) {
      return { to, ok: false, error: unlinkedMessage() };
    }
    const parsed = parseSendJson(result.stdout);
    if (result.code === 0 && parsed.ok) {
      return { to, ok: true };
    }
    const detail =
      parsed.error ||
      result.stderr.trim() ||
      result.stdout.trim() ||
      `go-signal send exited ${result.code}`;
    return { to, ok: false, error: detail };
  } catch (e) {
    return {
      to,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function sendOne(input: SendInput): Promise<SendResult> {
  return sendToRecipient(input.to, recipientOf(input.to), messageText(input));
}

/** Send to every recipient sequentially (one local Signal store). */
export async function sendBatch(inputs: SendInput[]): Promise<SendResult[]> {
  requireConfigured();
  const results: SendResult[] = [];
  for (const input of inputs) {
    results.push(await sendOne(input));
    if (!isSignalConfigured()) {
      for (const rest of inputs.slice(results.length)) {
        results.push({
          to: rest.to,
          ok: false,
          error: unlinkedMessage(),
        });
      }
      break;
    }
  }
  return results;
}

function contactLabel(name?: string, number?: string, aci?: string): string {
  if (name && number) return `${name} (${number})`;
  return (name || number || aci)!;
}

/** Known Signal users from the local store, excluding blocked and Note to Self. */
export async function listSignalContacts(
  opts: { sync?: boolean } = {},
): Promise<SignalContact[]> {
  requireConfigured();
  if (opts.sync) {
    try {
      const syncResult = await runSignal(
        ["-o", "json", "account", "sync", "--timeout", "15s"],
        { timeoutMs: 20_000 },
      );
      throwIfUnlinked(syncResult);
    } catch (e) {
      if (e instanceof SignalUnlinkedError) throw e;
      console.error("[signal] contact sync failed:", e);
    }
  }
  const result = await runSignal(["-o", "json", "contacts", "list"], {
    timeoutMs: 30_000,
  });
  throwIfUnlinked(result);
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `go-signal contacts list exited ${result.code}`,
    );
  }
  return parseContactsJson(result.stdout)
    .filter((c) => !c.blocked && (c.number || c.aci))
    .map((c) => ({
      id: c.number || c.aci!,
      label: contactLabel(c.name, c.number, c.aci),
      ...(c.number ? { number: c.number } : {}),
    }));
}

/** Send a short test message to Note to Self (`self`) or a contact. */
export async function sendSignalTest(to: string): Promise<SendResult> {
  requireConfigured();
  const recipient = resolveSignalRecipient(to);
  if (!recipient) {
    throw new Error("Choose Note to Self or a Signal contact.");
  }
  return sendToRecipient(to.trim(), recipient, SIGNAL_TEST_MESSAGE);
}

/**
 * One-shot receive so Signal does not drop this linked device (~30 days idle).
 * Safe to call when Signal is not configured (no-op).
 */
export async function keepSignalLinked(): Promise<void> {
  if (!isSignalConfigured()) return;
  try {
    await runSignal(["receive", "--timeout", "5s"], {
      timeoutMs: 30_000,
    });
  } catch (e) {
    console.error("[jobs] signal receive failed:", e);
  }
}
