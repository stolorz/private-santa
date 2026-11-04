import "server-only";
import { getWhatsAppConfig, isWhatsAppComplete } from "@/lib/integrations";
import type { PhoneMessage, SendResult } from "@/lib/phone-send";

export type SendInput = PhoneMessage;
export type { SendResult };

/**
 * Meta WhatsApp Cloud API delivery.
 *
 * Template body params are {{1}} giver name and {{2}} private guest link.
 * Phone-number id and template name come from admin settings;
 * per-recipient errors are collected and returned instead of being swallowed.
 */

const GRAPH_VERSION = "v19.0";

type WaConfig = {
  token: string;
  phoneId: string;
  template: string;
  language: string;
};

async function requireConfig(): Promise<WaConfig> {
  const cfg = await getWhatsAppConfig();
  if (!isWhatsAppComplete(cfg)) {
    throw new Error(
      "WhatsApp not configured: set the token, phone number id, template, and template language in Settings → Integrations.",
    );
  }
  return cfg;
}

/** True when Settings has a token, phone number id, template, and language. */
export async function isWhatsAppConfigured(): Promise<boolean> {
  const cfg = await getWhatsAppConfig();
  return isWhatsAppComplete(cfg);
}

async function sendOne(cfg: WaConfig, input: SendInput): Promise<SendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phoneId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: cfg.template,
      language: { code: cfg.language },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: input.giverName },
            { type: "text", text: input.secondParam },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { to: input.to, ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { to: input.to, ok: true };
  } catch (e) {
    return {
      to: input.to,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Send to every recipient, collecting per-recipient results. */
export async function sendBatch(inputs: SendInput[]): Promise<SendResult[]> {
  const cfg = await requireConfig();
  return Promise.all(inputs.map((input) => sendOne(cfg, input)));
}
