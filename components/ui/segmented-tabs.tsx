"use client";

import { cn } from "@/lib/utils";

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ id: T; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 rounded-md border p-1 text-xs sm:text-sm",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "min-w-20 flex-1 rounded-sm px-3 py-1.5 font-medium transition-colors",
            value === option.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          {option.count != null && option.count > 0 ? (
            <span className="text-destructive"> ({option.count})</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
