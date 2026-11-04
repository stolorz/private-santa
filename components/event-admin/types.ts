import type { Draw } from "@/lib/db/schema";
import type { RevealLink } from "@/lib/delivery-status";

export type CurrentDrawView = {
  draw: Draw;
  revealLinks: RevealLink[];
  assignedGiverIds: number[];
  assignedReceiverIds: number[];
};

export type DrawResponse = {
  draw: Draw;
  assignments: number;
};
