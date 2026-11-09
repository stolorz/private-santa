import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { notFound } from "@/lib/http";
import {
  GALLERY_VARIANT_MIME,
  isGalleryMediaKind,
  type GalleryMediaKind,
} from "@/lib/gallery/constants";
import {
  galleryOriginalPath,
  galleryVariantPath,
} from "@/lib/gallery/paths";

export function parseGalleryMediaKind(raw: string): GalleryMediaKind | null {
  return isGalleryMediaKind(raw) ? raw : null;
}

function contentDisposition(
  kind: "inline" | "attachment",
  name: string,
): string {
  const fallback =
    name.replace(/[\r\n"]/g, "").replace(/[^\x20-\x7E]/g, "_") || "photo";
  const encoded = encodeURIComponent(name);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function galleryFileResponse(opts: {
  filePath: string;
  mime: string;
  filename: string;
  download?: boolean;
  durable: boolean;
  missing: NextResponse;
}): Promise<NextResponse> {
  let size = 0;
  try {
    size = (await stat(opts.filePath)).size;
  } catch {
    return opts.missing;
  }
  const stream = Readable.toWeb(
    createReadStream(opts.filePath),
  ) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": opts.mime,
      "Content-Length": String(size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": opts.durable
        ? "private, max-age=31536000, immutable"
        : "private, no-store",
      "Content-Disposition": contentDisposition(
        opts.download ? "attachment" : "inline",
        opts.filename,
      ),
    },
  });
}

export function variantNotReadyResponse(): NextResponse {
  return NextResponse.json(
    { error: "This link is invalid." },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function serveGalleryPhoto(opts: {
  photo: { id: string; ext: string; mime: string; originalName: string };
  kind: GalleryMediaKind;
  variantReady: boolean;
  guest: boolean;
}): Promise<NextResponse> {
  const missing = opts.guest
    ? variantNotReadyResponse()
    : notFound("Unknown photo.");
  if (opts.kind === "original") {
    return galleryFileResponse({
      filePath: galleryOriginalPath(opts.photo.id, opts.photo.ext),
      mime: opts.photo.mime,
      filename: opts.photo.originalName,
      download: true,
      durable: true,
      missing,
    });
  }
  if (!opts.variantReady) return missing;
  return galleryFileResponse({
    filePath: galleryVariantPath(opts.photo.id, opts.kind),
    mime: GALLERY_VARIANT_MIME,
    filename: `${opts.photo.id}-${opts.kind}.avif`,
    download: false,
    durable: true,
    missing,
  });
}
