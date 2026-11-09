import { badRequest, notFound, route } from "@/lib/api";
import { isGalleryPhotoId } from "@/lib/gallery/constants";
import { parseGalleryMediaKind, serveGalleryPhoto } from "@/lib/gallery/media";
import { loadAdminPhotoMedia } from "@/lib/gallery/store";

export const GET = route(
  { auth: "eventAdmin" },
  async ({ event, params }) => {
    const id = params.id ?? "";
    const kind = parseGalleryMediaKind(params.variant ?? "");
    if (!isGalleryPhotoId(id) || !kind) return badRequest("Unknown photo.");
    const media = await loadAdminPhotoMedia({
      eventId: event.id,
      photoId: id,
      kind,
    });
    if (!media) return notFound("Unknown photo.");
    return serveGalleryPhoto({
      photo: media.photo,
      kind,
      variantReady: kind === "original" ? true : media.variantReady,
      guest: false,
    });
  },
);
