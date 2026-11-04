import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { auth } from "@/lib/auth";
import { authSecretStatus, rotateAuthSecret } from "@/lib/auth-secret";

export const GET = route({ auth: "admin" }, async () => {
  return NextResponse.json(authSecretStatus());
});

export const POST = route({ auth: "admin" }, async () => {
  const status = await rotateAuthSecret();
  await auth.api.signOut({ headers: await headers() });
  return NextResponse.json({ ok: true, ...status });
});
