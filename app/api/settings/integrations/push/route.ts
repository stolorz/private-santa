import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { integrationsViewFor, setPushSettings } from "@/lib/integrations";
import { generateVapidKeys } from "@/lib/push";

export const POST = route({ auth: "admin" }, async ({ user }) => {
  const keys = generateVapidKeys();
  await setPushSettings({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  });
  return NextResponse.json(await integrationsViewFor(user));
});
