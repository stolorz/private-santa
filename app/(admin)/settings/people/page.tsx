import { PeopleSettings } from "@/components/settings/people-settings";
import { listPeopleWithEvents } from "@/lib/people";
import { requireAdminPage } from "@/lib/session";

export default async function SettingsPeoplePage() {
  await requireAdminPage();
  return <PeopleSettings people={await listPeopleWithEvents()} />;
}
