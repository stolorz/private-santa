import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  hint,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={cn(
        "group relative flex items-center justify-between gap-4 rounded-md border px-3 py-2.5",
        disabled && "cursor-not-allowed",
      )}
      tabIndex={disabled ? 0 : undefined}
      aria-describedby={hint && disabled ? `${title}-hint` : undefined}
    >
      <span className={cn("text-sm", disabled && "opacity-50")}>
        <span className="font-medium">{title}</span>
        {description ? (
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      {hint && disabled ? (
        <>
          <span id={`${title}-hint`} className="sr-only">
            {hint}
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-xs -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md group-hover:block group-focus-within:block"
          >
            {hint}
          </span>
        </>
      ) : null}
    </label>
  );
}
