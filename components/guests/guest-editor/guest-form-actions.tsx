"use client";

import { Button } from "@/components/ui/button";

export function GuestFormActions({
  busy,
  saveDisabled,
  onCancel,
}: {
  busy?: boolean;
  saveDisabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 sm:col-span-2">
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || saveDisabled}>
        Save
      </Button>
    </div>
  );
}
