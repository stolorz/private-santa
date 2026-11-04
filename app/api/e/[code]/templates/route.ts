import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { templatesPatchSchema } from "@/lib/schemas";
import {
  invalidPlaceholderRequestError,
  templatePatchErrors,
} from "@/lib/templates";
import { getEventTemplates, setEventTemplates } from "@/lib/templates/store";

export const GET = route({ auth: "eventAdmin" }, async ({ event }) => {
  return NextResponse.json(await getEventTemplates(event.id));
});

export const PUT = route(
  {
    auth: "eventAdmin",
    body: templatesPatchSchema,
    invalid: "Invalid template settings.",
  },
  async ({ event, body }) => {
    const patchErrors = templatePatchErrors(body);
    if (patchErrors.length > 0) {
      return badRequest(invalidPlaceholderRequestError(patchErrors[0]!));
    }
    return NextResponse.json(await setEventTemplates(event.id, body));
  },
);
