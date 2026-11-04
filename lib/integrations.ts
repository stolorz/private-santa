import "server-only";
import { cachedSetting, getSettingMap, setSettingMap } from "@/lib/settings";
import { isSignalConfigured } from "@/lib/signal-store";
import { getSignalLinkStatus } from "@/lib/signal-link";
import type {
  EmailIntegrationView,
  IntegrationSource,
  IntegrationsView,
  PushIntegrationView,
  WhatsAppIntegrationView,
} from "@/lib/integrations-types";

export type {
  EmailIntegrationView,
  IntegrationSource,
  IntegrationsView,
  PushIntegrationView,
  SignalIntegrationView,
  WhatsAppIntegrationView,
} from "@/lib/integrations-types";

type FieldKind = "plain" | "secret";

type FieldSpec = {
  key: string;
  kind: FieldKind;
};

const SMTP_PORT_DEFAULT = 587;
const IMAP_PORT_DEFAULT = 993;

const WA = {
  token: { key: "wa.token", kind: "secret" },
  phoneId: { key: "wa.phoneId", kind: "plain" },
  template: { key: "wa.template", kind: "plain" },
  language: { key: "wa.language", kind: "plain" },
} as const satisfies Record<string, FieldSpec>;

const EMAIL = {
  host: { key: "email.host", kind: "plain" },
  port: { key: "email.port", kind: "plain" },
  user: { key: "email.user", kind: "plain" },
  password: { key: "email.password", kind: "secret" },
  from: { key: "email.from", kind: "plain" },
  imapHost: { key: "email.imapHost", kind: "plain" },
  imapPort: { key: "email.imapPort", kind: "plain" },
} as const satisfies Record<string, FieldSpec>;

const PUSH = {
  publicKey: { key: "push.publicKey", kind: "plain" },
  privateKey: {
    key: "push.privateKey",
    kind: "secret",
  },
  subject: { key: "push.subject", kind: "plain" },
} as const satisfies Record<string, FieldSpec>;

export interface WhatsAppConfig {
  token: string;
  phoneId: string;
  template: string;
  language: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  imapHost: string;
  imapPort: number;
}

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function fieldList(fields: Record<string, FieldSpec>): FieldSpec[] {
  return Object.values(fields);
}

function fieldKeys(fields: Record<string, FieldSpec>): string[] {
  return fieldList(fields).map((field) => field.key);
}

function readField(stored: Map<string, string>, field: FieldSpec): string {
  return (stored.get(field.key) ?? "").trim();
}

function sourceOfField(
  stored: Map<string, string>,
  field: FieldSpec,
): IntegrationSource {
  return stored.get(field.key) ? "db" : "none";
}

function keepSecret(
  incoming: string | undefined,
  current: string | undefined,
): string | undefined {
  if (incoming == null) return current;
  if (incoming.trim() === "") return current;
  return incoming.trim();
}

function persistField(
  incoming: string | undefined,
  current: string | undefined,
): string | undefined {
  if (incoming == null) return current;
  return incoming.trim();
}

async function loadFields(
  fields: Record<string, FieldSpec>,
): Promise<Map<string, string>> {
  return getSettingMap(fieldKeys(fields));
}

async function setFields(
  fields: Record<string, FieldSpec>,
  input: Record<string, string | undefined>,
) {
  const stored = await loadFields(fields);
  const entries: Record<string, string | undefined> = {};
  for (const [name, field] of Object.entries(fields)) {
    const persist = field.kind === "secret" ? keepSecret : persistField;
    entries[field.key] = persist(input[name], stored.get(field.key));
  }
  await setSettingMap(entries);
}

async function clearFields(fields: Record<string, FieldSpec>) {
  await setSettingMap(
    Object.fromEntries(fieldList(fields).map((field) => [field.key, ""])),
  );
}

function whatsappConfigFrom(stored: Map<string, string>): WhatsAppConfig {
  return {
    token: readField(stored, WA.token),
    phoneId: readField(stored, WA.phoneId),
    template: readField(stored, WA.template),
    language: readField(stored, WA.language),
  };
}

export function isWhatsAppComplete(cfg: WhatsAppConfig): boolean {
  return Boolean(cfg.token && cfg.phoneId && cfg.template && cfg.language);
}

export function isEmailComplete(
  cfg: Pick<EmailConfig, "host" | "port" | "user" | "password" | "from">,
): boolean {
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.password && cfg.from);
}

export function isEmailBounceComplete(cfg: EmailConfig): boolean {
  return isEmailComplete(cfg) && Boolean(cfg.imapHost && cfg.imapPort);
}

export function isPushComplete(cfg: PushConfig): boolean {
  return Boolean(cfg.publicKey && cfg.privateKey && cfg.subject);
}

const loadWhatsAppConfig = cachedSetting(fieldKeys(WA), whatsappConfigFrom);

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  return loadWhatsAppConfig();
}

/**
 * Blank uses `fallback` (587 / 993) only at connect time.
 * Any other value that is not an integer from 1 to 65535 is incomplete (`0`).
 */
function resolveMailPort(raw: string, fallback: number): number {
  if (raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  if (n < 1 || n > 65535) return 0;
  return n;
}

function emailConfigFrom(stored: Map<string, string>): EmailConfig {
  return {
    host: readField(stored, EMAIL.host),
    port: resolveMailPort(readField(stored, EMAIL.port), SMTP_PORT_DEFAULT),
    user: readField(stored, EMAIL.user),
    password: readField(stored, EMAIL.password),
    from: readField(stored, EMAIL.from),
    imapHost: readField(stored, EMAIL.imapHost),
    imapPort: resolveMailPort(
      readField(stored, EMAIL.imapPort),
      IMAP_PORT_DEFAULT,
    ),
  };
}

const loadEmailConfig = cachedSetting(fieldKeys(EMAIL), emailConfigFrom);

export async function getEmailConfig(): Promise<EmailConfig> {
  return loadEmailConfig();
}

function pushConfigFrom(stored: Map<string, string>): PushConfig {
  return {
    publicKey: readField(stored, PUSH.publicKey),
    privateKey: readField(stored, PUSH.privateKey),
    subject: readField(stored, PUSH.subject),
  };
}

const loadPushConfig = cachedSetting(fieldKeys(PUSH), pushConfigFrom);

export async function getPushConfig(): Promise<PushConfig> {
  return loadPushConfig();
}

export async function setWhatsAppSettings(input: {
  token?: string;
  phoneId?: string;
  template?: string;
  language?: string;
}) {
  await setFields(WA, input);
}

export async function clearWhatsAppSettings() {
  await clearFields(WA);
}

export async function setEmailSettings(input: {
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  from?: string;
  imapHost?: string;
  imapPort?: string;
}) {
  await setFields(EMAIL, input);
}

export async function clearEmailSettings() {
  await clearFields(EMAIL);
}

export async function setPushSettings(input: {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}) {
  await setFields(PUSH, input);
}

export async function clearPushSettings() {
  await clearFields(PUSH);
}

async function whatsappView(): Promise<WhatsAppIntegrationView> {
  const stored = await loadFields(WA);
  const cfg = whatsappConfigFrom(stored);
  return {
    configured: isWhatsAppComplete(cfg),
    tokenSet: Boolean(cfg.token),
    phoneId: cfg.phoneId,
    template: cfg.template,
    language: cfg.language,
    source: sourceOfField(stored, WA.token),
  };
}

function emailTestToKey(userId: string): string {
  return `email.testTo.${userId}`;
}

export async function setEmailTestTo(userId: string, to: string) {
  await setSettingMap({ [emailTestToKey(userId)]: to });
}

export interface IntegrationsViewOpts {
  userId?: string;
  fallbackEmail?: string;
}

async function loadEmailTestTo(
  opts?: IntegrationsViewOpts,
): Promise<string> {
  if (opts?.userId) {
    const stored = await getSettingMap([emailTestToKey(opts.userId)]);
    const saved = stored.get(emailTestToKey(opts.userId));
    if (saved) return saved;
  }
  return opts?.fallbackEmail?.trim() ?? "";
}

async function emailView(
  opts?: IntegrationsViewOpts,
): Promise<EmailIntegrationView> {
  const stored = await loadFields(EMAIL);
  const cfg = emailConfigFrom(stored);
  return {
    configured: isEmailComplete(cfg),
    passwordSet: Boolean(readField(stored, EMAIL.password)),
    host: readField(stored, EMAIL.host),
    port: readField(stored, EMAIL.port),
    user: readField(stored, EMAIL.user),
    from: readField(stored, EMAIL.from),
    imapHost: readField(stored, EMAIL.imapHost),
    imapPort: readField(stored, EMAIL.imapPort),
    source: sourceOfField(stored, EMAIL.password),
    testTo: await loadEmailTestTo(opts),
  };
}

async function pushView(): Promise<PushIntegrationView> {
  const stored = await loadFields(PUSH);
  const cfg = pushConfigFrom(stored);
  return {
    configured: isPushComplete(cfg),
    publicKey: cfg.publicKey,
    subject: cfg.subject,
    source: sourceOfField(stored, PUSH.publicKey),
  };
}

export async function integrationsViewFor(user: {
  id?: string;
  email?: string | null;
} | null) {
  return getIntegrationsView({
    userId: user?.id,
    fallbackEmail: user?.email ?? undefined,
  });
}

export async function getIntegrationsView(
  opts?: IntegrationsViewOpts,
): Promise<IntegrationsView> {
  const [whatsapp, email, push, signal] = await Promise.all([
    whatsappView(),
    emailView(opts),
    pushView(),
    Promise.resolve({
      configured: isSignalConfigured(),
      ...getSignalLinkStatus(),
    }),
  ]);
  return { whatsapp, email, push, signal };
}
