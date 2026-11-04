import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WinterCard } from "@/components/festive/winter-page";
import { nameVars } from "@/lib/name-cases";
import type { PastGift } from "@/lib/reveal";
import { interpolate } from "@/lib/templates/parse";
import type { RevealCopy } from "@/lib/templates/render";

export function PreviousYears({
  gifts,
  copy,
}: {
  gifts: readonly PastGift[];
  copy: Pick<RevealCopy, "previousTitle" | "previousDescription" | "previousRow">;
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
            return (
              <li
                key={`${gift.year}-${gift.personId}-${index}`}
                className="rounded-xl bg-secondary/70 px-4 py-2.5 text-base text-foreground"
              >
                {row}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </WinterCard>
  );
}
