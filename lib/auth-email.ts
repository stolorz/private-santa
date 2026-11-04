export const UNVERIFIED_EMAIL_LOGIN_MESSAGE =
  "Check your email to verify this account.";

/**
 * True when env SMTP is complete. This is a boot-time switch for organiser
 * email verification, not the mailbox used to send mail. Invitation and
 * verification messages use Settings → Integrations (`getEmailConfig`).
 */
export function organiserNeedsEmailVerification(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const host = env.SMTP_HOST?.trim() ?? "";
  const user = env.SMTP_USER?.trim() ?? "";
  const pass = env.SMTP_PASS?.trim() ?? "";
  const from = env.SMTP_FROM?.trim() ?? "";
  return Boolean(host && user && pass && from);
}

export function isUnverifiedEmailError(error: {
  code?: string | undefined;
  message?: string | undefined;
} | null): boolean {
  if (!error) return false;
  if (error.code === "EMAIL_NOT_VERIFIED") return true;
  return /email not verified/i.test(error.message ?? "");
}
