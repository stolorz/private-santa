import "server-only";
import { sendTransactionalEmail } from "@/lib/email";

export async function sendOrganiserVerificationEmail(input: {
  to: string;
  url: string;
}): Promise<void> {
  const result = await sendTransactionalEmail({
    to: input.to,
    subject: "Confirm your Secret Santa organiser account",
    text: `Open this link to confirm your organiser account:\n\n${input.url}\n`,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Could not send verification email.");
  }
}

/** Better Auth `emailVerification.sendVerificationEmail` adapter. */
export async function sendBetterAuthVerificationEmail(data: {
  user: { email: string };
  url: string;
}): Promise<void> {
  await sendOrganiserVerificationEmail({ to: data.user.email, url: data.url });
}

export async function sendOrganiserResetPasswordEmail(input: {
  to: string;
  url: string;
}): Promise<void> {
  const result = await sendTransactionalEmail({
    to: input.to,
    subject: "Reset your Secret Santa organiser password",
    text: `Open this link to choose a new password. It expires in one hour:\n\n${input.url}\n\nIf you did not ask for this, you can ignore this email.\n`,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Could not send password reset email.");
  }
}

/** Better Auth `emailAndPassword.sendResetPassword` adapter. */
export async function sendBetterAuthResetPassword(data: {
  user: { email: string };
  url: string;
  token: string;
}): Promise<void> {
  await sendOrganiserResetPasswordEmail({
    to: data.user.email,
    url: data.url,
  });
}
