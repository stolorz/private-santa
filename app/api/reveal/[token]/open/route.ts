import { NextResponse } from "next/server";
import { notFound, route } from "@/lib/api";
import { markGuestLinkOpened } from "@/lib/guest-link";
import { requestMeta } from "@/lib/request-meta";

export const POST = route(
  { auth: "public", rateLimit: "guest" },
  async ({ req, params }) => {
    const link = await markGuestLinkOpened(params.token, requestMeta(req));
    if (!link) return notFound("This link is invalid.");
    return NextResponse.json({ ok: true });
  },
);
