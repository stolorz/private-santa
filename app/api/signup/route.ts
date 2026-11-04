import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { optionalPhoneSchema } from "@/lib/schemas";
import { signupFirstOrganiser } from "@/lib/signup";

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  phone: optionalPhoneSchema,
});

export const POST = route(
  {
    auth: "public",
    body: signupSchema,
    invalid: "Invalid data.",
    rateLimit: "signup",
  },
  async ({ body }) => {
    const { needsVerification } = await signupFirstOrganiser(body);
    return NextResponse.json({ ok: true, needsVerification });
  },
);
