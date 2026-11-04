import { notFound } from "next/navigation";
import { DeliveryTab } from "@/components/event-admin/delivery-tab";
import { getEventWithSeriesByCode } from "@/lib/events";
import { getIntegrationsView } from "@/lib/integrations";
import { getInvitationSendView } from "@/lib/invitation-send";
import { getCurrentDraw } from "@/lib/pairings";
import { requireAdminPage } from "@/lib/session";

export default async function EventAdminDeliveryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();

  const [currentDraw, integrations, invitationSend] = await Promise.all([
    getCurrentDraw(found.event.id),
    getIntegrationsView(),
    getInvitationSendView(found.event.id),
  ]);

  return (
    <DeliveryTab
      key={currentDraw?.draw.id ?? "none"}
      code={found.event.code}
      integrations={integrations}
      invitationSend={invitationSend}
      currentDraw={currentDraw}
    />
  );
}
