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
import { sameNameQuestion } from "@/lib/guest-draft";
import type { PersonWithEvents } from "@/lib/people-types";

export function SameNameDialog({
  matches,
  onCancel,
  onMerge,
  onCreateNew,
}: {
  matches: PersonWithEvents[] | null;
  onCancel: () => void;
  onMerge: (personId: number) => void;
  onCreateNew: () => void;
}) {
  return (
    <Dialog
      open={matches != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        {matches ? (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 text-left">
                <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
                  <TriangleAlert className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-1.5">
                  <DialogTitle>Same name</DialogTitle>
                  <DialogDescription>
                    Choose the person this guest already is, or create a new
                    one.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <ul className="space-y-4">
              {matches.map((person) => (
                <li key={person.id} className="space-y-2">
                  <p className="text-sm">{sameNameQuestion(person)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onMerge(person.id)}
                  >
                    Same person
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" onClick={onCreateNew}>
                New person
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
