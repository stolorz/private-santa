"use client";
import { useEffect, useRef, useState } from "react";
import { PhotoCropper } from "@/components/inputs/photo-cropper";
import { initials } from "@/lib/person-name";
import { photoUrl } from "@/lib/public-path";
import { cn } from "@/lib/utils";

export function GuestAvatar({
  name,
  photo,
  preview,
  onPick,
  disabled,
}: {
  name: string;
  photo?: string | null;
  preview?: string | null;
  onPick?: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const src = preview ?? photoUrl(photo ?? null);
  const label = name.trim() ? `Photo of ${name}` : "Guest photo";

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function pick() {
    if (disabled || !onPick) return;
    inputRef.current?.click();
  }

  function closeCrop() {
    setCropSrc(null);
  }

  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} className="size-full object-cover" />
  ) : (
    <span className="text-xs font-medium text-muted-foreground">
      {initials(name) || "?"}
    </span>
  );

  return (
    <div className="shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Upload photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !onPick) return;
          setCropSrc(URL.createObjectURL(file));
        }}
      />
      {cropSrc && onPick ? (
        <PhotoCropper
          src={cropSrc}
          onCancel={closeCrop}
          onConfirm={(file) => {
            closeCrop();
            onPick(file);
          }}
        />
      ) : null}
      {onPick ? (
        <button
          type="button"
          onClick={pick}
          disabled={disabled}
          aria-label={src ? `Change photo of ${name}` : `Add photo of ${name}`}
          className={cn(
            "flex size-10 items-center justify-center overflow-hidden rounded-full border bg-muted",
            "hover:bg-accent disabled:pointer-events-none",
          )}
        >
          {inner}
        </button>
      ) : (
        <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {inner}
        </div>
      )}
    </div>
  );
}
