import { GALLERY_VARIANTS } from "@/lib/gallery/constants";
import type { EventPhotoView } from "@/lib/gallery/types";

export function photoGridStatus(
  photo: EventPhotoView,
): "ready" | "processing" | "failed" {
  if (
    GALLERY_VARIANTS.some((name) => photo.variants[name].status === "error")
  ) {
    return "failed";
  }
  if (photo.variants.thumb.status === "done") return "ready";
  return "processing";
}

export function photosNeedPoll(photos: readonly EventPhotoView[]): boolean {
  return photos.some((photo) =>
    GALLERY_VARIANTS.some((name) => {
      const status = photo.variants[name].status;
      return status === "pending" || status === "running";
    }),
  );
}
