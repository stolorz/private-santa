import { NextResponse } from "next/server";
import { route, badRequest, notFound } from "@/lib/api";
import { getPersonById, setPersonPhoto } from "@/lib/people";
import { photoFileFromForm, savePhoto } from "@/lib/photo";

export const POST = route({ auth: "admin", id: true }, async ({ req, id }) => {
  const existing = await getPersonById(id);
  if (!existing) return notFound("Person not found.");

  const photo = photoFileFromForm(await req.formData());
  if ("error" in photo) return badRequest(photo.error);

  const filename = await savePhoto(
    Buffer.from(await photo.file.arrayBuffer()),
    photo.file.type,
  );
  const updated = await setPersonPhoto(id, filename);
  return NextResponse.json(updated);
});

export const DELETE = route({ auth: "admin", id: true }, async ({ id }) => {
  const existing = await getPersonById(id);
  if (!existing) return notFound("Person not found.");

  const updated = await setPersonPhoto(id, null);
  return NextResponse.json(updated);
});
