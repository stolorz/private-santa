import { count } from "drizzle-orm";
import {
  ORGANISER_SIGNUP_UNAVAILABLE,
  organiserSignupAllowed,
} from "@/lib/auth-role";
import { db, schema } from "@/lib/db";
import { insertOrganiserPerson } from "@/lib/people";
import { takePendingOrganiser } from "@/lib/signup-pending";

/**
 * Better Auth `user.create.before`. Only the first account may register;
 * that user is promoted to admin when signup is allowed.
 */
export async function beforeCreateUser<T extends { email: string }>(user: T) {
  if (!organiserSignupAllowed(user.email)) {
    throw new Error(ORGANISER_SIGNUP_UNAVAILABLE);
  }
  const isFirstUser =
    (await db.select({ c: count() }).from(schema.user))[0]?.c === 0;
  if (!isFirstUser) {
    throw new Error("An organiser already exists. Log in instead.");
  }
  return { data: { ...user, role: "admin" as const } };
}

export async function afterCreateUser(user: { id: string }) {
  const extra = takePendingOrganiser();
  if (!extra) return;
  insertOrganiserPerson(user.id, extra);
}
