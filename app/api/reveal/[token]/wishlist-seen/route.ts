import { NextResponse } from "next/server";
import { notFound, route } from "@/lib/api";
import { markMatchWishlistSeen } from "@/lib/guest-link";

export const POST = route(
  { auth: "public", rateLimit: "guest" },
  async ({ params }) => {
    const link = await markMatchWishlistSeen(params.token);
    if (!link) return notFound("This link is invalid.");
    return NextResponse.json({ ok: true });
  },
);
