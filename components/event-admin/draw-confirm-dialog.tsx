"use client";

import { ArrowRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DrawConfirmDialog({
  open,
  running,
  hasPairs,
  avoidPastPairings,
  givers,
  onCancel,
  onContinue,
}: {
  open: boolean;
  running: boolean;
  hasPairs: boolean;
  avoidPastPairings: boolean;
  givers: Array<{ id: number; name: string; recipients: string[] }>;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const description = hasPairs
    ? "This will assign a gift recipient to each remaining guest listed below. Existing pairs are kept. Invitations are sent from Delivery."
    : "This will assign a gift recipient to each guest listed below. Invitations are sent from Delivery.";

  return (
    <ConfirmDialog
      open={open}
      title={hasPairs ? "Draw remaining?" : "Run the draw?"}
      description={description}
      confirmLabel="Continue"
      busy={running}
      onConfirm={onContinue}
      onCancel={() => {
        if (!running) onCancel();
      }}
    >
      {avoidPastPairings && (
        <p className="text-sm text-muted-foreground">
          The draw will also try to avoid last year&apos;s pairings when it
          can.
        </p>
      )}
      <ul className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        {givers.map((giver) => (
          <li
            key={giver.id}
            className="col-span-3 grid grid-cols-subgrid items-center"
          >
            <span className="font-medium">{giver.name}</span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span
              className={
                giver.recipients.length === 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {giver.recipients.length === 0
                ? "No possible recipients"
                : giver.recipients.join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
