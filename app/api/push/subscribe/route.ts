import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/lib/api";
import { db, schema } from "@/lib/db";

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

const delSchema = z.object({ endpoint: z.string().url() });

export const POST = route(
  { auth: "admin", body: subSchema, invalid: "Invalid subscription." },
  async ({ user, body }) => {
    await db
      .insert(schema.pushSubscription)
      .values({
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscription.endpoint,
        set: {
          userId: user.id,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        },
      });
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = route(
  { auth: "admin", body: delSchema, invalid: "Invalid request." },
  async ({ body }) => {
    await db
      .delete(schema.pushSubscription)
      .where(eq(schema.pushSubscription.endpoint, body.endpoint));
    return NextResponse.json({ ok: true });
  },
);
