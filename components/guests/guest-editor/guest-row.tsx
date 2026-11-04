"use client";

import type { ReactNode } from "react";
import { GuestAvatar } from "@/components/guests/guest-avatar";
import { guestRowClass } from "@/components/guests/shared-contact";
import type { SharedContactIssue } from "@/lib/guest-contact";

export function GuestRow({
  name,
  photo,
  preview,
  summary,
  error,
  issues,
  editing = false,
  onOpen,
  onPickPhoto,
  photoDisabled,
  actions,
  extra,
  children,
}: {
  name: string;
  photo?: string | null;
  preview?: string | null;
  summary?: string;
  error?: string | null;
  issues: SharedContactIssue[];
  editing?: boolean;
  onOpen?: () => void;
  onPickPhoto?: (file: File) => void;
  photoDisabled?: boolean;
  actions?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  if (editing) {
    return (
      <li className={guestRowClass(issues)}>
        <div className="flex items-start gap-2">
          <GuestAvatar
            name={name}
            photo={photo}
            preview={preview}
            onPick={onPickPhoto}
            disabled={photoDisabled}
          />
          <div className="min-w-0 flex-1 space-y-2">
            {children}
            {extra}
          </div>
          {actions}
        </div>
      </li>
    );
  }

  return (
    <li className={guestRowClass(issues, "flex items-center gap-2 text-sm")}>
      <GuestAvatar
        name={name}
        photo={photo}
        onPick={onPickPhoto}
        disabled={photoDisabled}
      />
      <button
        type="button"
        className="min-w-0 flex-1 rounded-sm text-left hover:bg-accent/60"
        onClick={onOpen}
      >
        <span>{name}</span>
        {summary ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>
        ) : null}
        {error ? (
          <div className="mt-0.5 text-xs text-destructive">{error}</div>
        ) : null}
      </button>
      {actions}
    </li>
  );
}
