"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  forceOpen = false,
  trailing,
  children,
}: {
  title: string;
  description: ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const expanded = open || forceOpen;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left hover:bg-accent/40"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <span className="flex shrink-0 items-center gap-2">
            {trailing}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </button>
      <div id={panelId} hidden={!expanded} className="space-y-3 border-t px-3 py-3">
        {children}
      </div>
    </div>
  );
}
