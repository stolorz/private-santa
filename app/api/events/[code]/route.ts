import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { deleteEdition, eventImpact, updateEdition } from "@/lib/events";
import { eventDeleteSchema, eventPatchSchema } from "@/lib/schemas";

export const GET = route({ auth: "eventAdmin" }, async ({ event, series }) => {
  return NextResponse.json(await eventImpact(event, series));
});

export const PATCH = route(
  { auth: "eventAdmin", body: eventPatchSchema, invalid: "Invalid event data." },
  async ({ event, body }) => {
    return NextResponse.json(await updateEdition(event, body));
  },
);

export const DELETE = route(
  {
    auth: "eventAdmin",
    body: eventDeleteSchema,
    invalid: "Invalid event data.",
  },
  async ({ event, body }) => {
    await deleteEdition(event, body.deletePersonIds);
    return NextResponse.json({ ok: true });
  },
);
