import { NextResponse } from "next/server";
import { route, conflict, serverError } from "@/lib/api";
import { listSignalContacts } from "@/lib/signal";
import { isSignalConfigured } from "@/lib/signal-store";

export const GET = route({ auth: "admin" }, async ({ req }) => {
  if (!isSignalConfigured()) return conflict("Signal is not linked.");
  const sync = req.nextUrl.searchParams.get("sync") === "1";
  try {
    return NextResponse.json({ contacts: await listSignalContacts({ sync }) });
  } catch (e) {
    return serverError(
      e instanceof Error ? e.message : "Could not list Signal contacts.",
    );
  }
});
