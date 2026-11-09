import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { adminPhotoListPayload } from "@/lib/gallery/store";

export const GET = route({ auth: "eventAdmin" }, async ({ event }) => {
  return NextResponse.json(await adminPhotoListPayload(event.id));
});
