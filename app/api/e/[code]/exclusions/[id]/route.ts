import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { removeExclusion } from "@/lib/exclusion-store";

export const DELETE = route({ auth: "eventAdmin", id: true }, async ({ event, id }) => {
  await removeExclusion(event.id, id);
  return NextResponse.json({ ok: true });
});
