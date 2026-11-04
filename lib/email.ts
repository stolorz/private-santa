import "server-only";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig, isEmailComplete } from "@/lib/integrations";
import { processSingleton } from "@/lib/process-singleton";
import {
  EMAIL_BANNER_CID,
  EMAIL_BANNER_PATH,
  plainEmailHtml,
} from "@/lib/templates";

/**
 * Optional transactional email via a domain mailbox (SMTP). Config comes
 * from admin settings (Settings → Integrations). Callers skip via
 * {@link isEmailConfigured}; sending without config throws. Invitation mail
 * is sent from the Delivery tab (`deliverAssignments` / `POST /send`), not
 * from draw execution. Env `SMTP_*` is not used for sending — it only
 * turns on organiser email verification at boot.
 */

export const SANTA_TOKEN_HEADER = "X-Santa-Token";

export interface EmailInput {
  to: string;
  subject: string;
  /** plain-text body; also wrapped in the card layout when `html` is unset */
  text: string;
  html?: string;
  /** Draw mail only — verification mail must omit this. */
  revealToken?: string;
}

export interface EmailResult {
  to: string;
  ok: boolean;
  error?: string;
}

export async function isEmailConfigured(): Promise<boolean> {
  const cfg = await getEmailConfig();
  return isEmailComplete(cfg);
}

const EMAIL_FAIL_REASON_MAX = 300;

export function clipEmailFailReason(reason: string): string {
  const trimmed = reason.trim().replace(/\s+/g, " ");
  if (trimmed.length <= EMAIL_FAIL_REASON_MAX) return trimmed;
  return `${trimmed.slice(0, EMAIL_FAIL_REASON_MAX - 1)}…`;
}

function santaMessageId(token: string, domain: string): string {
  return `<santa.${token}@${domain}>`;
}

function messageIdDomain(from: string, host: string): string {
  const match = from.match(/@([^\s>]+)/);
  return match?.[1] ?? host;
}

type MailClient = {
  transporter: Transporter;
  from: string;
  user: string;
  domain: string;
};

type MailSlot = {
  key: string;
  client: MailClient | null;
};

function mailSlot(): MailSlot {
  return processSingleton("__santaMailClient", () => ({
    key: "",
    client: null,
  }));
}

export function resetMailClient(): void {
  const slot = mailSlot();
  slot.client?.transporter.close();
  slot.key = "";
  slot.client = null;
}

async function mailClient(): Promise<MailClient> {
  const cfg = await getEmailConfig();
  if (!isEmailComplete(cfg)) {
    throw new Error(
      "Email not configured: set the mailbox in Settings → Integrations.",
    );
  }
  const key = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.from}|${cfg.password}`;
  const slot = mailSlot();
  if (slot.client && slot.key === key) return slot.client;
  slot.client?.transporter.close();
  const client: MailClient = {
    transporter: nodemailer.createTransport({
      pool: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.password },
    }),
    from: cfg.from,
    user: cfg.user,
    domain: messageIdDomain(cfg.from, cfg.host),
  };
  slot.key = key;
  slot.client = client;
  return client;
}

function winterBannerAttachment() {
  return {
    filename: path.basename(EMAIL_BANNER_PATH),
    path: path.join(process.cwd(), "public", EMAIL_BANNER_PATH.replace(/^\//, "")),
    cid: EMAIL_BANNER_CID,
    contentDisposition: "inline" as const,
    contentType: "image/png",
  };
}

async function sendOne(
  mail: MailClient,
  input: EmailInput,
): Promise<EmailResult> {
  const draw = input.revealToken
    ? {
        attachments: [winterBannerAttachment()],
        headers: { [SANTA_TOKEN_HEADER]: input.revealToken },
        messageId: santaMessageId(input.revealToken, mail.domain),
      }
    : {};
  try {
    await mail.transporter.sendMail({
      from: mail.from,
      envelope: { from: mail.user, to: [input.to] },
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? plainEmailHtml(input.text),
      ...draw,
    });
    return { to: input.to, ok: true };
  } catch (e) {
    return {
      to: input.to,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function sendEmailBatch(
  inputs: EmailInput[],
): Promise<EmailResult[]> {
  if (inputs.length === 0) return [];
  const mailer = await mailClient();
  return Promise.all(inputs.map((input) => sendOne(mailer, input)));
}

/** Account mail (verification) — no draw token, no X-Santa-Token. */
export async function sendTransactionalEmail(
  input: EmailInput,
): Promise<EmailResult> {
  const mail = await mailClient();
  return sendOne(mail, input);
}

export const EMAIL_TEST_TOKEN = "test";

/** Empty batch: SMTP never reported a per-recipient outcome. */
export function emailResultFromBatch(
  results: EmailResult[],
  to: string,
): EmailResult {
  return (
    results[0] ?? {
      to,
      ok: false,
      error: "Could not determine if the send was successful.",
    }
  );
}

export async function sendEmailTest(to: string): Promise<EmailResult> {
  return emailResultFromBatch(
    await sendEmailBatch([
      {
        to,
        subject: "Secret Santa test",
        text: "This is a Secret Santa test. If you received this, email delivery is working.",
        revealToken: EMAIL_TEST_TOKEN,
      },
    ]),
    to,
  );
}
