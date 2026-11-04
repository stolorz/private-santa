import { NextResponse } from "next/server";
import { z } from "zod";
import { notFound, route } from "@/lib/api";
import {
  createEdition,
  createSeriesWithFirstEdition,
  getEventByCode,
  visibleSeriesFor,
} from "@/lib/events";
import { occursOnSchema } from "@/lib/schemas";

export const GET = route({ auth: "user" }, async ({ user }) => {
  return NextResponse.json(await visibleSeriesFor(user));
});

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("series"),
    name: z.string().min(1),
    occursOn: occursOnSchema,
  }),
  z.object({
    kind: z.literal("edition"),
    seriesId: z.number().int().positive(),
    occursOn: occursOnSchema,
    name: z.string().min(1),
    fromCode: z.string().min(1).optional(),
  }),
]);

export const POST = route(
  { auth: "admin", body: createSchema, invalid: "Invalid event data." },
  async ({ body }) => {
    if (body.kind === "series") {
      const created = await createSeriesWithFirstEdition({
        name: body.name,
        occursOn: body.occursOn,
      });
      return NextResponse.json(created, { status: 201 });
    }
    let fromEventId: number | undefined;
    if (body.fromCode) {
      const source = await getEventByCode(body.fromCode);
      if (!source || source.seriesId !== body.seriesId) {
        return notFound("Unknown source edition.");
      }
      fromEventId = source.id;
    }
    const event = await createEdition({
      seriesId: body.seriesId,
      occursOn: body.occursOn,
      name: body.name,
      fromEventId,
    });
    return NextResponse.json(event, { status: 201 });
  },
);
