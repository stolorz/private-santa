import { SafetySettings } from "@/components/settings/safety-settings";
import { authSecretStatus } from "@/lib/auth-secret";
import { requireAdminPage } from "@/lib/session";

export default async function SettingsSafetyPage() {
  await requireAdminPage();
  return <SafetySettings initial={authSecretStatus()} />;
}
