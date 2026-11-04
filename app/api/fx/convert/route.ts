import { NextResponse } from "next/server";
import { badRequest, route } from "@/lib/api";
import { isCurrency } from "@/lib/budget";
import { convertEventBudget } from "@/lib/fx";

export const GET = route({ auth: "admin" }, async ({ req }) => {
  const amountRaw = req.nextUrl.searchParams.get("amount") ?? "";
  const currency = req.nextUrl.searchParams.get("currency") ?? "";
  if (!/^\d+(\.\d{1,2})?$/.test(amountRaw) || !isCurrency(currency)) {
    return badRequest("Invalid amount or currency.");
  }
  return NextResponse.json(await convertEventBudget(Number(amountRaw), currency));
});
