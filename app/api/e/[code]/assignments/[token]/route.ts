import { NextResponse } from "next/server";
import { z } from "zod";
import { route, notFound } from "@/lib/api";
import {
  deleteAssignmentInEvent,
  setAssignmentDelivery,
} from "@/lib/pairings";
import { deliveryFlagsFrom } from "@/lib/delivery-status";

const bodySchema = z.object({
  whatsapp: z.boolean(),
  signal: z.boolean(),
  email: z.boolean(),
  manual: z.boolean(),
});

export const PATCH = route(
  { auth: "eventAdmin", body: bodySchema, invalid: "Invalid delivery data." },
  async ({ event, params, body }) => {
    const updated = await setAssignmentDelivery(
      params.token,
      event.id,
      body,
    );
    if (!updated) return notFound("Assignment not found.");
    return NextResponse.json({
      delivered: deliveryFlagsFrom(updated),
      emailFailed: updated.emailFailed === true,
      emailFailedReason: updated.emailFailedReason ?? null,
    });
  },
);

export const DELETE = route({ auth: "eventAdmin" }, async ({ event, params }) => {
  const result = await deleteAssignmentInEvent(params.token, event.id);
  if (!result) return notFound("Assignment not found.");
  return NextResponse.json(result);
});
