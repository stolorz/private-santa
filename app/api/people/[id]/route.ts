import { NextResponse } from "next/server";
import { notFound, route } from "@/lib/api";
import {
  getPersonById,
  personFieldsSchema,
  removePerson,
  updatePerson,
} from "@/lib/people";

export const PUT = route(
  { auth: "admin", body: personFieldsSchema, invalid: "Invalid data.", id: true },
  async ({ id, body }) => {
    const existing = await getPersonById(id);
    if (!existing) return notFound("Person not found.");

    const updated = await updatePerson(id, {
      ...body,
      phone: body.phone,
      email: body.email,
    });
    if (!updated) return notFound("Person not found.");
    return NextResponse.json(updated);
  },
);

export const DELETE = route({ auth: "admin", id: true }, async ({ id }) => {
  const removed = await removePerson(id);
  if (!removed) return notFound("Person not found.");
  return NextResponse.json({ ok: true });
});
