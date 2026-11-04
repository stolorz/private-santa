import { NextResponse } from "next/server";
import { notFound, route } from "@/lib/api";
import { currentDrawResultsCsv } from "@/lib/draw-results";

export const GET = route({ auth: "eventAdmin" }, async ({ event }) => {
  const file = await currentDrawResultsCsv(event);
  if (!file) return notFound("No draw yet.");
  return new NextResponse(file.body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
