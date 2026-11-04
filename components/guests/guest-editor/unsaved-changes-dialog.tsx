"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UnsavedChangesDialog({
  open,
  busy,
  saveDisabled,
  onStay,
  onDiscard,
  onSave,
}: {
  open: boolean;
  busy?: boolean;
  saveDisabled?: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onStay();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            Save your changes, discard them, or keep editing.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onStay}>
            Stay
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button type="button" disabled={busy || saveDisabled} onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
