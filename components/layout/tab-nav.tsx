"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabCountTone = "muted" | "destructive";

export type TabNavItem = {
  href: string;
  label: string;
  /** Only active on this exact path, not on nested paths. */
  exact?: boolean;
  /** Hidden when zero or absent. */
  count?: number;
  /** Inventory tally vs problem count. Defaults to destructive. */
  countTone?: TabCountTone;
};

function TabLabel({
  label,
  active,
  count = 0,
  countTone = "destructive",
}: {
  label: string;
  active: boolean;
  count?: number;
  countTone?: TabCountTone;
}) {
  const { pending } = useLinkStatus();
  const filled = active || pending;
  return (
    <span
      className={cn(
        "flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-center font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : pending
            ? "animate-pulse bg-primary/60 text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {count > 0 ? (
        <>
          {" "}
          <span
            data-tab-count={count}
            className={cn(
              "-mt-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none",
              countTone === "muted"
                ? filled
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
                : filled
                  ? "bg-background text-destructive"
                  : "bg-destructive/15 text-destructive",
            )}
          >
            {count}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function TabNav({ tabs }: { tabs: TabNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 rounded-md border p-1 text-xs sm:text-sm">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link key={tab.href} href={tab.href} className="flex-1">
            <TabLabel
              label={tab.label}
              active={active}
              count={tab.count}
              countTone={tab.countTone}
            />
          </Link>
        );
      })}
    </nav>
  );
}
