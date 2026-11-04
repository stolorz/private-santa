import { NextResponse } from "next/server";
import { z } from "zod";
import { route, conflict } from "@/lib/api";
import { getPushConfig } from "@/lib/integrations";
import { sendPushTest } from "@/lib/push";

const bodySchema = z.object({
  endpoint: z.string().url(),
});

export const POST = route(
  { auth: "admin", body: bodySchema, invalid: "Enable push notifications on this device first." },
  async ({ user, body }) => {
    const cfg = await getPushConfig();
    if (!cfg.publicKey || !cfg.privateKey) {
      return conflict("Web Push is not configured.");
    }
    const result = await sendPushTest(user.id, body.endpoint);
    if (result.sent === 0 && result.failed === 0) {
      return conflict("Enable push notifications on this device first.");
    }
    return NextResponse.json({
      ok: result.sent > 0,
      sent: result.sent,
      failed: result.failed,
      ...(result.sent === 0
        ? { error: "Could not deliver the test notification." }
        : {}),
    });
  },
);
