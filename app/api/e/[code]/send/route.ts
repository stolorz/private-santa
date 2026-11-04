import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { sendInvitations } from "@/lib/invitation-send";

const bodySchema = z.object({
  mode: z.enum(["pending", "resend"]),
  channels: z
    .object({
      whatsapp: z.boolean(),
      signal: z.boolean(),
      email: z.boolean(),
    })
    .optional(),
});

export const POST = route(
  { auth: "eventAdmin", body: bodySchema, invalid: "Invalid send request." },
  async ({ event, body }) => {
    return NextResponse.json(
      await sendInvitations(event.id, body.mode, body.channels),
    );
  },
);
