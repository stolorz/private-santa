import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { db, first, schema } from "@/lib/db";
import type { Assignment } from "@/lib/db/schema";
import {
  clipEmailFailReason,
  EMAIL_TEST_TOKEN,
  SANTA_TOKEN_HEADER,
} from "@/lib/email";
import { getEmailConfig, isEmailBounceComplete } from "@/lib/integrations";
import { normalizeEmail } from "@/lib/people";
import { getSettingMap, setSettingMap } from "@/lib/settings";

const IMAP_UID = "email.imapUid";
const IMAP_UIDVALIDITY = "email.imapUidValidity";

export interface BounceParse {
  token: string | null;
  recipients: string[];
  reason: string;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAILER_RE =
  /mailer-daemon|postmaster|mail delivery subsystem|undelivered mail|delivery status notification/i;

function uniqueEmails(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function headerValue(raw: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.*)$`, "im");
  const match = raw.match(re);
  return match?.[1]?.trim() ?? null;
}

function collectRecipients(raw: string): string[] {
  const found: string[] = [];
  const lineRe =
    /^(?:Final-Recipient|Original-Recipient|X-Failed-Recipients):\s*(?:rfc822;\s*)?(.+)$/gim;
  for (const match of raw.matchAll(lineRe)) {
    found.push(...(match[1].match(EMAIL_RE) ?? []));
  }
  return uniqueEmails(found);
}

function bounceReason(raw: string): string {
  const diagnostic = headerValue(raw, "Diagnostic-Code");
  if (diagnostic) return diagnostic;
  const status = headerValue(raw, "Status");
  if (status) return `Status ${status}`;
  const subject = headerValue(raw, "Subject");
  if (subject) return subject;
  return "Bounce";
}

function looksLikeBounce(raw: string): boolean {
  if (/multipart\/report|message\/delivery-status/i.test(raw)) return true;
  if (/^Action:\s*failed\b/im.test(raw)) return true;
  if (
    MAILER_RE.test(raw) &&
    (headerValue(raw, SANTA_TOKEN_HEADER) || collectRecipients(raw).length)
  ) {
    return true;
  }
  return false;
}

function tokenFromRaw(raw: string): string | null {
  const header = headerValue(raw, SANTA_TOKEN_HEADER);
  if (header) return header.split(/\s/)[0];
  const mid = raw.match(/<santa\.([^@>\s]+)@/i);
  return mid?.[1] ?? null;
}

/** Parse a raw RFC822 bounce. Returns null when the message is not a failure DSN. */
export function parseBounceMessage(raw: string): BounceParse | null {
  if (!looksLikeBounce(raw)) return null;
  const token = tokenFromRaw(raw);
  const recipients = collectRecipients(raw);
  if (!token && recipients.length === 0) return null;
  return {
    token,
    recipients,
    reason: bounceReason(raw),
  };
}

async function markAssignmentFailed(assignment: Assignment, reason: string) {
  await db
    .update(schema.assignment)
    .set({
      emailFailed: true,
      emailFailedReason: clipEmailFailReason(reason),
    })
    .where(eq(schema.assignment.id, assignment.id));
}

async function assignmentByToken(
  token: string,
): Promise<Assignment | undefined> {
  return first(
    db
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.revealToken, token)),
  );
}

async function assignmentByRecipient(
  recipients: string[],
): Promise<Assignment | undefined> {
  if (recipients.length === 0) return undefined;
  const row = await first(
    db
      .select({ assignment: schema.assignment })
      .from(schema.assignment)
      .innerJoin(schema.draw, eq(schema.assignment.drawId, schema.draw.id))
      .innerJoin(schema.guest, eq(schema.assignment.giverId, schema.guest.id))
      .innerJoin(schema.person, eq(schema.guest.personId, schema.person.id))
      .leftJoin(schema.user, eq(schema.person.userId, schema.user.id))
      .where(
        and(
          eq(schema.draw.status, "completed"),
          or(
            inArray(schema.person.email, recipients),
            inArray(schema.user.email, recipients),
          ),
        ),
      )
      .orderBy(desc(schema.draw.executedAt))
      .limit(1),
  );
  return row?.assignment;
}

/** Persist a bounce against the matching assignment. Returns whether a row was updated. */
export async function applyEmailBounce(parsed: BounceParse): Promise<boolean> {
  if (parsed.token === EMAIL_TEST_TOKEN) return false;
  const byToken = parsed.token
    ? await assignmentByToken(parsed.token)
    : undefined;
  const row = byToken ?? (await assignmentByRecipient(parsed.recipients));
  if (!row) return false;
  await markAssignmentFailed(row, parsed.reason);
  return true;
}

function sourceToString(source: unknown): string {
  if (typeof source === "string") return source;
  if (Buffer.isBuffer(source)) return source.toString("utf8");
  if (source instanceof Uint8Array) return Buffer.from(source).toString("utf8");
  return String(source ?? "");
}

function uidValidityOf(value: unknown): string {
  return String(value ?? "");
}

let bouncePollBusy = false;

/**
 * Read new INBOX mail for bounce DSNs and mark matching assignments.
 * No-ops when email is not configured. Never throws.
 */
export async function pollEmailBounces(): Promise<number> {
  if (bouncePollBusy) return 0;
  bouncePollBusy = true;
  try {
    return await pollEmailBouncesOnce();
  } finally {
    bouncePollBusy = false;
  }
}

async function pollEmailBouncesOnce(): Promise<number> {
  const cfg = await getEmailConfig();
  if (!isEmailBounceComplete(cfg)) {
    return 0;
  }

  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapPort === 993,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  let marked = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) return 0;
      const validity = uidValidityOf(mailbox.uidValidity);
      const stored = await getSettingMap([IMAP_UID, IMAP_UIDVALIDITY]);
      const storedValidity = stored.get(IMAP_UIDVALIDITY) ?? "";
      const storedUid = Number.parseInt(stored.get(IMAP_UID) ?? "0", 10);
      const sameMailbox = storedValidity === validity;
      const fromUid = sameMailbox && storedUid > 0 ? storedUid + 1 : 1;
      const uidNext = Number(mailbox.uidNext ?? fromUid);
      if (sameMailbox && fromUid >= uidNext) return 0;

      let lastUid = sameMailbox ? storedUid : 0;
      const fetcher = sameMailbox
        ? client.fetch(
            `${fromUid}:*`,
            { uid: true, source: true },
            { uid: true },
          )
        : client.fetch({ seen: false }, { uid: true, source: true });

      for await (const msg of fetcher) {
        lastUid = Math.max(lastUid, Number(msg.uid));
        const parsed = parseBounceMessage(sourceToString(msg.source));
        if (parsed && (await applyEmailBounce(parsed))) marked++;
        try {
          await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
        } catch {
          // Seen flag is best-effort; UID cursor still advances.
        }
      }

      await setSettingMap({
        [IMAP_UID]: String(lastUid),
        [IMAP_UIDVALIDITY]: validity,
      });
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error("[email] bounce poll failed:", e);
  } finally {
    try {
      await client.logout();
    } catch {
      /* already disconnected */
    }
  }
  return marked;
}
