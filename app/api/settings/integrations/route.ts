import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import {
  clearEmailSettings,
  clearPushSettings,
  clearWhatsAppSettings,
  integrationsViewFor,
  setEmailSettings,
  setPushSettings,
  setWhatsAppSettings,
} from "@/lib/integrations";

const whatsappSchema = z.object({
  token: z.string().optional(),
  phoneId: z.string().optional(),
  template: z.string().optional(),
  language: z.string().optional(),
});

const emailSchema = z.object({
  host: z.string().optional(),
  port: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().optional(),
  imapHost: z.string().optional(),
  imapPort: z.string().optional(),
});

const pushSchema = z.object({
  subject: z.string().optional(),
});

const bodySchema = z.object({
  whatsapp: z.union([whatsappSchema, z.null()]).optional(),
  email: z.union([emailSchema, z.null()]).optional(),
  push: z.union([pushSchema, z.null()]).optional(),
});

export const GET = route({ auth: "admin" }, async ({ user }) => {
  return NextResponse.json(await integrationsViewFor(user));
});

export const PUT = route(
  { auth: "admin", body: bodySchema, invalid: "Invalid integration settings." },
  async ({ user, body }) => {
    if (body.whatsapp === null) await clearWhatsAppSettings();
    else if (body.whatsapp) await setWhatsAppSettings(body.whatsapp);

    if (body.email === null) await clearEmailSettings();
    else if (body.email) await setEmailSettings(body.email);

    if (body.push === null) await clearPushSettings();
    else if (body.push) await setPushSettings(body.push);

    return NextResponse.json(await integrationsViewFor(user));
  },
);
