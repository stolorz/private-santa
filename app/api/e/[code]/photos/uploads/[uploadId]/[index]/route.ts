import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { isGalleryPhotoId } from "@/lib/gallery/constants";
import { saveGalleryChunk } from "@/lib/gallery/upload";

export const PUT = route(
  { auth: "eventAdmin" },
  async ({ event, params, req }) => {
    const uploadId = params.uploadId ?? "";
    const index = Number(params.index);
    if (!isGalleryPhotoId(uploadId)) return badRequest("Unknown upload.");
    const bytes = Buffer.from(await req.arrayBuffer());
    await saveGalleryChunk({
      eventId: event.id,
      uploadId,
      index,
      bytes,
    });
    return NextResponse.json({ ok: true });
  },
);
