import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { addManualPair } from "@/lib/draw-runner";

const bodySchema = z.object({
  giverId: z.number().int().positive(),
  receiverId: z.number().int().positive(),
});

export const POST = route(
  { auth: "eventAdmin", body: bodySchema, invalid: "Invalid pair data." },
  async ({ event, body }) => {
    const result = await addManualPair(event, body);
    return NextResponse.json(result, { status: 201 });
  },
);
