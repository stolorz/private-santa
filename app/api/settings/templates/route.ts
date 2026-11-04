import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { templatesPatchSchema } from "@/lib/schemas";
import { getTemplates, setTemplates } from "@/lib/templates/store";
import {
  invalidPlaceholderRequestError,
  templatePatchErrors,
} from "@/lib/templates";

export const GET = route({ auth: "admin" }, async () => {
  return NextResponse.json(await getTemplates());
});

export const PUT = route(
  { auth: "admin", body: templatesPatchSchema, invalid: "Invalid template settings." },
  async ({ body }) => {
    const patchErrors = templatePatchErrors(body);
    if (patchErrors.length > 0) {
      return badRequest(invalidPlaceholderRequestError(patchErrors[0]!));
    }
    return NextResponse.json(await setTemplates(body));
  },
);
