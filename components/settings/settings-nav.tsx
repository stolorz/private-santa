"use client";

import { TabNav } from "@/components/layout/tab-nav";
import { useTemplateErrorCount } from "@/components/settings/template-error-count";

const TABS = [
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/templates", label: "Templates" },
  { href: "/settings/people", label: "Guests" },
  { href: "/settings/safety", label: "Safety" },
];

export function SettingsNav() {
  const templateErrors = useTemplateErrorCount();
  return (
    <TabNav
      tabs={TABS.map((tab) =>
        tab.href === "/settings/templates"
          ? { ...tab, count: templateErrors }
          : tab,
      )}
    />
  );
}
