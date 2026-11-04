import { NextResponse } from "next/server";
import { z } from "zod";
import { route, badRequest, conflict, serverError } from "@/lib/api";
import { sendSignalTest } from "@/lib/signal";
import { isSignalConfigured } from "@/lib/signal-store";

const bodySchema = z.object({
  to: z.string().trim().min(1),
});

export const POST = route(
  { auth: "admin", body: bodySchema, invalid: "Choose Note to Self or a Signal contact." },
  async ({ body }) => {
    if (!isSignalConfigured()) return conflict("Signal is not linked.");
    try {
      return NextResponse.json(await sendSignalTest(body.to));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not send a Signal test.";
      if (/choose note to self/i.test(message)) return badRequest(message);
      return serverError(message);
    }
  },
);
