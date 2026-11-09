import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { initGalleryUpload } from "@/lib/gallery/upload";

const initSchema = z.object({
  filename: z.string(),
  size: z.number().int(),
  capturedAt: z.number().finite().nullable().optional(),
});

export const POST = route(
  { auth: "eventAdmin", body: initSchema, invalid: "Invalid upload." },
  async ({ event, body }) => {
    const started = await initGalleryUpload({
      eventId: event.id,
      filename: body.filename,
      size: body.size,
      capturedAt: body.capturedAt,
    });
    return NextResponse.json(started, { status: 201 });
  },
);
