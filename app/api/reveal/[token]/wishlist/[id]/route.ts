import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import {
  deleteOwnedWishlistItem,
  updateOwnedWishlistItem,
  wishlistTextSchema,
} from "@/lib/wishlist";

export const PATCH = route(
  {
    auth: "guest",
    id: true,
    body: wishlistTextSchema,
    invalid: "Invalid wishlist item.",
    rateLimit: "guest",
  },
  async ({ link, id, body }) => {
    const row = await updateOwnedWishlistItem(link.giver.id, id, body.text);
    return NextResponse.json(row);
  },
);

export const DELETE = route({ auth: "guest", id: true }, async ({ link, id }) => {
  await deleteOwnedWishlistItem(link.giver.id, id);
  return NextResponse.json({ ok: true });
});
