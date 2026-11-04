"use client";

import type { ReactNode } from "react";
import { CollapsibleSection } from "@/components/settings/collapsible-section";
import { Badge } from "@/components/settings/integrations/test-result";

export function IntegrationSection({
  title,
  description,
  configured,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: ReactNode;
  configured: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <CollapsibleSection
      title={title}
      description={description}
      defaultOpen={defaultOpen}
      trailing={<Badge on={configured} />}
    >
      {children}
    </CollapsibleSection>
  );
}
