import { NextResponse } from "next/server";
import { route, serverError } from "@/lib/api";
import { integrationsViewFor } from "@/lib/integrations";
import { startSignalLink, unlinkSignalDevice } from "@/lib/signal-link";

export const GET = route({ auth: "admin" }, async ({ user }) => {
  return NextResponse.json(await integrationsViewFor(user));
});

export const POST = route({ auth: "admin" }, async ({ user }) => {
  try {
    await startSignalLink();
  } catch (e) {
    return serverError(
      e instanceof Error ? e.message : "Could not start Signal linking.",
    );
  }
  return NextResponse.json(await integrationsViewFor(user));
});

export const DELETE = route({ auth: "admin" }, async ({ user }) => {
  try {
    await unlinkSignalDevice();
  } catch (e) {
    return serverError(
      e instanceof Error ? e.message : "Could not unlink Signal.",
    );
  }
  return NextResponse.json(await integrationsViewFor(user));
});
