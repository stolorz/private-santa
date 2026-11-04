import "server-only";
import { organiserNeedsEmailVerification } from "@/lib/auth-email";
import { auth } from "@/lib/auth";
import {
  ORGANISER_SIGNUP_UNAVAILABLE,
  organiserSignupAllowed,
} from "@/lib/auth-role";
import { DomainError } from "@/lib/errors";
import { insertOrganiserPerson, normalizeEmail } from "@/lib/people";
import { optionalPhoneSchema } from "@/lib/schemas";
import { hasRegisteredUser } from "@/lib/session";
import { setPendingOrganiser, takePendingOrganiser } from "@/lib/signup-pending";

export async function signupFirstOrganiser(input: {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
}): Promise<{ needsVerification: boolean }> {
  if (await hasRegisteredUser()) {
    throw new DomainError("An organiser already exists. Log in instead.");
  }
  if (!organiserSignupAllowed(input.email)) {
    throw new DomainError(ORGANISER_SIGNUP_UNAVAILABLE);
  }

  const phoneResult = optionalPhoneSchema.safeParse(input.phone);
  if (!phoneResult.success) {
    throw new DomainError(
      phoneResult.error.issues[0]?.message ?? "Invalid phone number.",
    );
  }

  setPendingOrganiser({
    name: input.name,
    phone: phoneResult.data || null,
    email: normalizeEmail(input.email),
  });
  try {
    const result = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
    });
    if (!result?.user?.id) throw new DomainError("Could not create account.");
    const extra = takePendingOrganiser();
    if (extra) insertOrganiserPerson(result.user.id, extra);
    return { needsVerification: organiserNeedsEmailVerification() };
  } catch (err: unknown) {
    takePendingOrganiser();
    if (err instanceof DomainError) throw err;
    const message =
      err instanceof Error ? err.message : "Could not create account.";
    throw new DomainError(message);
  }
}
