import { IntegrationsSettings } from "@/components/settings/integrations-settings";
import { getIntegrationsView } from "@/lib/integrations";
import { requireAdminPage } from "@/lib/session";

export default async function SettingsIntegrationsPage() {
  const user = await requireAdminPage();
  const integrations = await getIntegrationsView({
    userId: user.id,
    fallbackEmail: user.email,
  });
  return <IntegrationsSettings initial={integrations} />;
}
