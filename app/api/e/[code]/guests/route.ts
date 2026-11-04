import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, notFound, route } from "@/lib/api";
import { optionalNameCasesFromBody } from "@/lib/name-cases";
import {
  personFieldsObject,
  withRequiredPolishCases,
} from "@/lib/schemas";
import {
  addGuestToEvent,
  findOrCreatePerson,
  getPersonById,
  guestById,
  guestsForEvent,
  updatePerson,
} from "@/lib/people";

export const GET = route({ auth: "eventAdmin" }, async ({ event }) => {
  return NextResponse.json(await guestsForEvent(event.id));
});

const createSchema = withRequiredPolishCases(
  personFieldsObject
    .extend({
      personId: z.number().int().positive().optional(),
      createNew: z.boolean().optional(),
    })
    .refine((d) => d.personId != null || !!d.name, {
      message: "Name or personId is required.",
    }),
);

export const POST = route(
  { auth: "eventAdmin", body: createSchema, invalid: "Invalid guest data." },
  async ({ event, body }) => {
    let personId = body.personId;
    if (personId) {
      const person = await getPersonById(personId);
      if (!person) return notFound("Unknown person.");
      const personPatch: {
        language?: typeof body.language;
        gender?: typeof body.gender;
      } & ReturnType<typeof optionalNameCasesFromBody> = {
        ...optionalNameCasesFromBody(body),
        gender: body.gender,
      };
      if (body.language && body.language !== person.language) {
        personPatch.language = body.language;
      }
      await updatePerson(person.id, personPatch);
    } else {
      const created = await findOrCreatePerson({
        name: body.name!,
        phone: body.phone || null,
        email: body.email ?? null,
        language: body.language,
        gender: body.gender,
        createNew: body.createNew,
        ...optionalNameCasesFromBody(body),
      });
      personId = created.person.id;
    }

    const seat = await addGuestToEvent(event.id, personId);
    if (seat === "duplicate") {
      return badRequest("That person is already a guest of this edition.");
    }

    const view = await guestById(seat.id);
    return NextResponse.json(view ?? seat, { status: 201 });
  },
);
