import "server-only";
import { count } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { requestCache } from "@/lib/request-cache";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export const getCurrentUser = requestCache(async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
});

/** Redirect unless a signed-in organiser is viewing the page. */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/events");
  return user;
}

/** True once the first organiser account exists. */
export async function hasRegisteredUser(): Promise<boolean> {
  const row = (await db.select({ c: count() }).from(schema.user))[0];
  return (row?.c ?? 0) > 0;
}
