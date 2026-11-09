import type { PhotoVariantName } from "@/lib/db/schema";

export type PhotoVariantView = {
  status: "pending" | "running" | "done" | "error";
  error: string | null;
  bytes: number | null;
};

export type EventPhotoView = {
  id: string;
  originalName: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  capturedAt: Date;
  uploadedAt: Date;
  variants: Record<PhotoVariantName, PhotoVariantView>;
};

export type ReadyPhotoView = {
  id: string;
  width: number;
  height: number;
  capturedAt: Date;
  variants: Record<PhotoVariantName, boolean>;
};
