import Link from "next/link";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WinterCard } from "@/components/festive/winter-page";
import { nameVars } from "@/lib/name-cases";
import type { PastGift } from "@/lib/reveal";
import { interpolate } from "@/lib/templates/parse";
import type { RevealCopy } from "@/lib/templates/render";
import { galleryPath } from "@/lib/public-path";
import { cn } from "@/lib/utils";

export function PreviousYears({
  gifts,
  copy,
  token,
}: {
  gifts: readonly PastGift[];
  copy: Pick<
    RevealCopy,
    "previousTitle" | "previousDescription" | "previousRow" | "photosButton"
  >;
  token: string;
}) {
  if (gifts.length === 0) return null;
  return (
    <WinterCard>
      <CardHeader className="px-6 pt-7 pb-4 sm:px-8">
        <CardTitle className="text-xl text-foreground sm:text-2xl">
          {copy.previousTitle}
        </CardTitle>
        <CardDescription className="text-base">
          {copy.previousDescription}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-7 sm:px-8">
        <ul className="space-y-2">
          {gifts.map((gift, index) => {
            const row =
              interpolate(copy.previousRow, {
                ...nameVars("receiver", gift),
                year: gift.year,
              }).trim() || `${gift.year} — ${gift.name}`;
            const photosHref =
              gift.photoCount > 0
                ? galleryPath(token, gift.eventCode)
                : null;
            return (
              <li
                key={`${gift.year}-${gift.personId}-${index}`}
                className={cn(
                  "rounded-xl bg-secondary/70 px-4 py-2.5 text-base text-foreground",
                  photosHref && "flex items-center gap-3",
                )}
              >
                {photosHref ? (
                  <>
                    <span className="min-w-0 flex-1 truncate" title={row}>
                      {row}
                    </span>
                    <Button asChild size="sm" className="shrink-0">
                      <Link href={photosHref}>{copy.photosButton}</Link>
                    </Button>
                  </>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </WinterCard>
  );
}
