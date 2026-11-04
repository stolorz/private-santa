import { normalizeGuestEmail } from "@/lib/guest-contact";

export const ORGANISER_SIGNUP_UNAVAILABLE = "Organiser signup is not available.";

/**
 * First-user lock. When `ADMIN_EMAIL` is set, the address must match.
 * Production refuses signup if the var is blank so an empty database
 * cannot be claimed by whoever reads the source.
 */
export function organiserSignupAllowed(
  email: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const adminEmail = normalizeGuestEmail(env.ADMIN_EMAIL);
  if (env.NODE_ENV === "production" && !adminEmail) return false;
  const candidate = normalizeGuestEmail(email);
  if (adminEmail && candidate !== adminEmail) return false;
  return true;
}
