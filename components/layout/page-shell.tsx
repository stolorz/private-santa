import type { ReactNode } from "react";
import { CardContent } from "@/components/ui/card";
import { WinterCard, WinterPage } from "@/components/festive/winter-page";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn("mx-auto max-w-2xl space-y-6 p-4 sm:p-8", className)}
    >
      {children}
    </main>
  );
}

export function CenteredCard({
  title,
  description,
  children,
  className,
  brand = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  brand?: boolean;
}) {
  return (
    <WinterPage title={title} subtitle={description} brand={brand}>
      <WinterCard className={className}>
        <CardContent className="px-6 pt-7 pb-7 sm:px-8">{children}</CardContent>
      </WinterCard>
    </WinterPage>
  );
}
