"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabNavItem = {
  href: string;
  label: string;
  /** Only active on this exact path, not on nested paths. */
  exact?: boolean;
  /** Problem lines. Omitted from the label when zero or absent. */
  count?: number;
};

function TabLabel({
  label,
  active,
  count = 0,
}: {
  label: string;
  active: boolean;
  count?: number;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "block rounded-sm px-3 py-1.5 text-center font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : pending
            ? "animate-pulse bg-primary/60 text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {count > 0 ? (
        <span className="text-destructive"> ({count})</span>
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
            <TabLabel label={tab.label} active={active} count={tab.count} />
          </Link>
        );
      })}
    </nav>
  );
}
