import { NextRequest, NextResponse } from "next/server";
import { notFound } from "@/lib/api";
import { isPhotoFilename, readPhoto } from "@/lib/photo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!isPhotoFilename(file)) return notFound();
  const photo = await readPhoto(file);
  if (!photo) return notFound();

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
