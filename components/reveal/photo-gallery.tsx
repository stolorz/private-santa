"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhotoLightbox } from "@/components/reveal/photo-lightbox";
import type { ReadyPhotoView } from "@/lib/gallery/types";
import { galleryMediaPath } from "@/lib/public-path";
import type { RevealCopy } from "@/lib/templates/render";

export function PhotoGallery({
  token,
  photos,
  copy,
}: {
  token: string;
  photos: readonly ReadyPhotoView[];
  copy: Pick<
    RevealCopy,
    | "galleryBack"
    | "galleryClose"
    | "galleryDownload"
    | "galleryPrevious"
    | "galleryNext"
  >;
}) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <Button asChild variant="outline" size="sm">
        <Link href={`/${token}`}>{copy.galleryBack}</Link>
      </Button>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button
                type="button"
                className="block w-full overflow-hidden rounded-xl bg-secondary"
                onClick={() => setIndex(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={galleryMediaPath(token, photo.id, "thumb")}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <PhotoLightbox
        token={token}
        photos={photos}
        index={index}
        onIndexChange={setIndex}
        copy={copy}
      />
    </div>
  );
}
