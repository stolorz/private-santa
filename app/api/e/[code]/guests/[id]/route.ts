import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, notFound, route } from "@/lib/api";
import {
  personFieldsObject,
  withRequiredPolishCases,
} from "@/lib/schemas";
import {
  assertLinkableUser,
  guestInEdition,
  removeGuest,
  updatePerson,
} from "@/lib/people";

const updateSchema = withRequiredPolishCases(
  personFieldsObject.extend({
    userId: z.string().min(1).nullable().optional(),
  }),
);

export const PUT = route(
  { auth: "eventAdmin", body: updateSchema, invalid: "Invalid data.", id: true },
  async ({ event, id, body }) => {
    const existing = await guestInEdition(event.id, id);
    if (!existing) return notFound("Guest not found.");

    if (body.userId) await assertLinkableUser(body.userId, existing.personId);

    await updatePerson(existing.personId, {
      ...body,
      phone: body.phone,
      email: body.email,
    });

    const view = await guestInEdition(event.id, id);
    if (!view) return notFound("Guest not found.");
    return NextResponse.json(view);
  },
);

const deleteScopeSchema = z.enum(["event", "person"]);

export const DELETE = route(
  { auth: "eventAdmin", id: true },
  async ({ req, event, id }) => {
    const rawScope = req.nextUrl.searchParams.get("scope");
    const parsedScope = deleteScopeSchema.safeParse(rawScope ?? "event");
    if (!parsedScope.success) return badRequest("Invalid scope.");

    const result = await removeGuest(id, event.id, parsedScope.data);
    if (result === "not_found") return notFound("Guest not found.");
    return NextResponse.json({ ok: true });
  },
);
