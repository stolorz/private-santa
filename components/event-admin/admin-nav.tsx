"use client";

import { TabNav } from "@/components/layout/tab-nav";
import { useTemplateErrorCount } from "@/components/settings/template-error-count";

export function AdminNav({
  code,
  guestCount,
}: {
  code: string;
  guestCount: number;
}) {
  const base = `/e/${code}/admin`;
  const templateErrors = useTemplateErrorCount();
  return (
    <TabNav
      tabs={[
        { href: base, label: "General", exact: true },
        {
          href: `${base}/templates`,
          label: "Templates",
          count: templateErrors,
        },
        { href: `${base}/guests`, label: `Guests (${guestCount})` },
        { href: `${base}/exclusions`, label: "Exclusions" },
        { href: `${base}/draw`, label: "Draw" },
        { href: `${base}/delivery`, label: "Delivery" },
      ]}
    />
  );
}
