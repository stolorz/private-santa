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
