import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  leading,
  actions,
}: {
  title: string;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex gap-3",
        leading
          ? "items-center justify-between"
          : "flex-col sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <h1 className="min-w-0 truncate font-heading text-xl font-semibold text-primary">
          {title}
        </h1>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
