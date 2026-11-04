import { NextResponse } from "next/server";
import { z } from "zod";
import { route, badRequest, conflict } from "@/lib/api";
import { isEmailConfigured, sendEmailTest } from "@/lib/email";
import { setEmailTestTo } from "@/lib/integrations";
import { normalizeGuestEmail as normalizeEmail } from "@/lib/guest-contact";

const bodySchema = z.object({
  to: z.string(),
});

export const POST = route(
  { auth: "admin", body: bodySchema, invalid: "Enter an email address." },
  async ({ user, body }) => {
    if (!(await isEmailConfigured())) {
      return conflict("Email is not configured.");
    }
    const to = normalizeEmail(body.to);
    if (!to || !z.string().email().safeParse(to).success) {
      return badRequest("Invalid email address.");
    }
    await setEmailTestTo(user.id, to);
    const result = await sendEmailTest(to);
    return NextResponse.json({
      ok: result.ok,
      to: result.to,
      ...(result.ok
        ? {}
        : { error: result.error ?? "Could not send the test email." }),
    });
  },
);
