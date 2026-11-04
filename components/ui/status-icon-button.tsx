"use client";

import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type StatusTone = "yes" | "no" | "none" | "error";

function toneClass(tone: StatusTone) {
  if (tone === "yes") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "error") return "text-destructive";
  if (tone === "none") return "text-muted-foreground/20";
  return "text-muted-foreground/35";
}

export function StatusIconButton({
  icon: Icon,
  tone,
  label,
  onClick,
  strikethrough = false,
  badge,
}: {
  icon: LucideIcon;
  tone: StatusTone;
  label: string;
  onClick?: () => void;
  strikethrough?: boolean;
  badge?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex size-6 items-center justify-center rounded-md",
            toneClass(tone),
          )}
          aria-label={label}
          onClick={onClick}
        >
          <Icon className="size-4" />
          {strikethrough ? (
            <span
              aria-hidden
              className="absolute inset-x-1.5 top-1/2 h-px -rotate-45 bg-current"
            />
          ) : null}
          {badge ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-current"
            />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
