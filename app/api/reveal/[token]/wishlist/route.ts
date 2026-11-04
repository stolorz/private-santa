import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { addWishlistItem, listWishlistItems, wishlistTextSchema } from "@/lib/wishlist";

export const GET = route({ auth: "guest" }, async ({ link }) => {
  return NextResponse.json(await listWishlistItems(link.giver.id));
});

export const POST = route(
  {
    auth: "guest",
    body: wishlistTextSchema,
    invalid: "Invalid wishlist item.",
    rateLimit: "guest",
  },
  async ({ link, body }) => {
    const row = await addWishlistItem(link.giver.id, body.text);
    return NextResponse.json(row, { status: 201 });
  },
);
