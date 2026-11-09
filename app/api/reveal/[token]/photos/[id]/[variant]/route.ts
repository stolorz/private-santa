import { route } from "@/lib/api";
import { guestGalleryMedia } from "@/lib/gallery/access";
import { isGalleryPhotoId } from "@/lib/gallery/constants";
import {
  parseGalleryMediaKind,
  serveGalleryPhoto,
  variantNotReadyResponse,
} from "@/lib/gallery/media";

export const GET = route({ auth: "guest" }, async ({ link, params }) => {
  const id = params.id ?? "";
  const kind = parseGalleryMediaKind(params.variant ?? "");
  if (!isGalleryPhotoId(id) || !kind) return variantNotReadyResponse();
  const media = await guestGalleryMedia(link, id, kind);
  if (!media) return variantNotReadyResponse();
  return serveGalleryPhoto({
    photo: media.photo,
    kind,
    variantReady: media.variantReady,
    guest: true,
  });
});
