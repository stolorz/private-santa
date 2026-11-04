import { badRequest, notFound, route } from "@/lib/api";
import { guestById, guestInEdition, setPersonPhoto } from "@/lib/people";
import { photoFileFromForm, savePhoto } from "@/lib/photo";
import { NextResponse } from "next/server";

export const POST = route({ auth: "eventAdmin", id: true }, async ({ req, event, id }) => {
  const row = await guestInEdition(event.id, id);
  if (!row) return notFound("Guest not found.");

  const photo = photoFileFromForm(await req.formData());
  if ("error" in photo) return badRequest(photo.error);

  const filename = await savePhoto(
    Buffer.from(await photo.file.arrayBuffer()),
    photo.file.type,
  );
  await setPersonPhoto(row.personId, filename);

  const view = await guestById(row.id);
  return NextResponse.json(view);
});

export const DELETE = route({ auth: "eventAdmin", id: true }, async ({ event, id }) => {
  const row = await guestInEdition(event.id, id);
  if (!row) return notFound("Guest not found.");

  await setPersonPhoto(row.personId, null);
  const view = await guestById(row.id);
  return NextResponse.json(view);
});
