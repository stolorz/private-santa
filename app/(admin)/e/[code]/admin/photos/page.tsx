import { notFound } from "next/navigation";
import { PhotosTab } from "@/components/event-admin/photos-tab";
import { getEventWithSeriesByCode } from "@/lib/events";
import { adminPhotoListPayload } from "@/lib/gallery/store";
import { requireAdminPage } from "@/lib/session";

export default async function EventAdminPhotosPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  await requireAdminPage();
  const found = await getEventWithSeriesByCode(code);
  if (!found) notFound();
  const initial = await adminPhotoListPayload(found.event.id);
  return <PhotosTab code={found.event.code} initial={initial} />;
}
