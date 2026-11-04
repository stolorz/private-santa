import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import {
  setAutomaticExclusions,
  setDrawDeliveryFlags,
  startDraw,
} from "@/lib/draw-runner";
import { latestDrawForEvent } from "@/lib/pairings";

const patchSchema = z.object({
  deliverWhatsapp: z.boolean().optional(),
  deliverSignal: z.boolean().optional(),
  deliverEmail: z.boolean().optional(),
  allowSelfDraw: z.boolean().optional(),
  avoidPastPairings: z.boolean().optional(),
});

export const GET = route({ auth: "eventAdmin" }, async ({ event }) => {
  const draw = await latestDrawForEvent(event.id);
  return NextResponse.json(draw ? [draw] : []);
});

export const PATCH = route(
  { auth: "eventAdmin", body: patchSchema, invalid: "Invalid delivery channels." },
  async ({ event, body }) => {
    const hasDelivery =
      body.deliverWhatsapp != null ||
      body.deliverSignal != null ||
      body.deliverEmail != null;
    const hasRules =
      body.allowSelfDraw != null || body.avoidPastPairings != null;

    let draw = null;
    if (hasDelivery) {
      draw = await setDrawDeliveryFlags(event.id, {
        deliverWhatsapp: body.deliverWhatsapp,
        deliverSignal: body.deliverSignal,
        deliverEmail: body.deliverEmail,
      });
    }
    if (hasRules) {
      draw = await setAutomaticExclusions(event.id, {
        allowSelfDraw: body.allowSelfDraw,
        avoidPastPairings: body.avoidPastPairings,
      });
    } else if (!hasDelivery) {
      draw = (await latestDrawForEvent(event.id)) ?? null;
    }
    return NextResponse.json({ draw });
  },
);

export const POST = route({ auth: "eventAdmin" }, async ({ event }) => {
  const result = await startDraw(event);
  return NextResponse.json(result, { status: 201 });
});
