import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { isGalleryPhotoId } from "@/lib/gallery/constants";
import { deleteEventPhoto } from "@/lib/gallery/store";

export const DELETE = route({ auth: "eventAdmin" }, async ({ event, params }) => {
  const id = params.id ?? "";
  if (!isGalleryPhotoId(id)) return badRequest("Unknown photo.");
  await deleteEventPhoto(event.id, id);
  return NextResponse.json({ ok: true });
});
