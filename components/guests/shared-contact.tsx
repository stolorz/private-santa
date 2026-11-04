"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  sharedContactTitle,
  sharedContactTooltip,
  sharedContactWarningLines,
  type SharedContactIssue,
} from "@/lib/guest-contact";
import { cn } from "@/lib/utils";

export function guestRowClass(issues: SharedContactIssue[], extra?: string) {
  return cn(
    "rounded-md border px-3 py-2",
    issues.length > 0 &&
      "border-amber-400/80 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10",
    extra,
  );
}

export function SharedContactMark({ issues }: { issues: SharedContactIssue[] }) {
  if (issues.length === 0) return null;
  const label = sharedContactTooltip(issues);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          className="inline-flex size-8 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400"
          aria-label={label}
        >
          <TriangleAlert className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SharedContactDialog({
  issues,
  onCancel,
  onConfirm,
}: {
  issues: SharedContactIssue[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={issues != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        {issues && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 text-left">
                <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
                  <TriangleAlert className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-1.5">
                  <DialogTitle>{sharedContactTitle(issues)}</DialogTitle>
                  <DialogDescription>
                    That&apos;s common for spouses and children. Invitations and
                    messages for each of them will go to the same contact.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {sharedContactWarningLines(issues).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" onClick={onConfirm}>
                Save anyway
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
