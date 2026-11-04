import { NextResponse } from "next/server";
import { getPushConfig } from "@/lib/integrations";

/** Public VAPID key for Web Push subscribe. Empty when push is not set up. */
export async function GET() {
  const cfg = await getPushConfig();
  return NextResponse.json({
    publicKey: cfg.publicKey && cfg.privateKey ? cfg.publicKey : "",
  });
}
