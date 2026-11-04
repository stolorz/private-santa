import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { addExclusion, listExclusions } from "@/lib/exclusion-store";

const createSchema = z.object({
  aId: z.number().int().positive(),
  bId: z.number().int().positive(),
});

export const GET = route({ auth: "eventAdmin" }, async ({ event }) => {
  return NextResponse.json(await listExclusions(event.id));
});

export const POST = route(
  { auth: "eventAdmin", body: createSchema, invalid: "Invalid exclusion data." },
  async ({ event, body }) => {
    const row = await addExclusion(event.id, body.aId, body.bId);
    return NextResponse.json(row, { status: 201 });
  },
);
