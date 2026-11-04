import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { TemplateErrorCountProvider } from "@/components/settings/template-error-count";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/session";
import { getTemplates } from "@/lib/templates/store";
import { templateErrorTotal } from "@/lib/templates/validate";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPage();
  const templateErrors = templateErrorTotal(await getTemplates());

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        leading={<SignOutButton />}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/events">Events</Link>
          </Button>
        }
      />
      <TemplateErrorCountProvider count={templateErrors}>
        <SettingsNav />
        {children}
      </TemplateErrorCountProvider>
    </PageShell>
  );
}
