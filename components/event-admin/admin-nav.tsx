"use client";

import { TabNav } from "@/components/layout/tab-nav";
import { useTemplateErrorCount } from "@/components/settings/template-error-count";

export function AdminNav({
  code,
  guestCount,
  photoCount,
}: {
  code: string;
  guestCount: number;
  photoCount: number;
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
        {
          href: `${base}/guests`,
          label: "Guests",
          count: guestCount,
          countTone: "muted",
        },
        { href: `${base}/exclusions`, label: "Exclusions" },
        { href: `${base}/draw`, label: "Draw" },
        { href: `${base}/delivery`, label: "Delivery" },
        {
          href: `${base}/photos`,
          label: "Photos",
          count: photoCount,
          countTone: "muted",
        },
      ]}
    />
  );
}
