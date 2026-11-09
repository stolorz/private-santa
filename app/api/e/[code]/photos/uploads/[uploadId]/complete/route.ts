import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { isGalleryPhotoId } from "@/lib/gallery/constants";
import { completeGalleryUpload } from "@/lib/gallery/upload";

export const POST = route({ auth: "eventAdmin" }, async ({ event, params }) => {
  const uploadId = params.uploadId ?? "";
  if (!isGalleryPhotoId(uploadId)) return badRequest("Unknown upload.");
  const photo = await completeGalleryUpload({
    eventId: event.id,
    uploadId,
  });
  return NextResponse.json(photo, { status: 201 });
});
