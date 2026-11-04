import { TemplatesSettings } from "@/components/settings/templates-settings";
import { apiPath } from "@/lib/public-path";
import { requireAdminPage } from "@/lib/session";
import { getTemplates } from "@/lib/templates/store";

export default async function SettingsTemplatesPage() {
  await requireAdminPage();
  return (
    <TemplatesSettings
      initial={await getTemplates()}
      saveUrl={apiPath("/api/settings/templates")}
    />
  );
}
