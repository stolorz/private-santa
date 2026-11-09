import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { isGalleryPhotoId } from "@/lib/gallery/constants";
import { retryEventPhoto } from "@/lib/gallery/store";

export const POST = route({ auth: "eventAdmin" }, async ({ event, params }) => {
  const id = params.id ?? "";
  if (!isGalleryPhotoId(id)) return badRequest("Unknown photo.");
  await retryEventPhoto(event.id, id);
  return NextResponse.json({ ok: true });
});
