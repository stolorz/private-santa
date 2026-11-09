"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Snowflake, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BerrySprig, GiftBox } from "@/components/festive/festive-motifs";
import { WinterCard } from "@/components/festive/winter-page";
import { PreviousYears } from "@/components/reveal/previous-years";
import { requestJson } from "@/lib/fetch-json";
import { galleryPath, photoUrl, revealApiPath } from "@/lib/public-path";
import type { PastGift, RevealedMatch } from "@/lib/reveal";
import { interpolate } from "@/lib/templates/parse";
import type { RevealCopy } from "@/lib/templates/render";
import { nameVars } from "@/lib/name-cases";
import { initials } from "@/lib/person-name";
import { cn } from "@/lib/utils";

/**
 * Keeps the gift icon still while the heading font swaps in.
 * The hidden copy is the fallback face, which is what paints first, so the
 * row width never changes when Playpen Sans or Klee One replaces it.
 */
function UnwrapLabel({ children }: { children: ReactNode }) {
  return (
    <span className="relative text-center leading-snug">
      <span
        aria-hidden="true"
        className="invisible font-heading-reserve"
      >
        {children}
      </span>
      <span className="absolute inset-0">{children}</span>
    </span>
  );
}

function MatchPortrait({
  match,
  resolvePhoto,
}: {
  match: RevealedMatch | null;
  resolvePhoto: (filename: string | null) => string | null;
}) {
  const src = resolvePhoto(match?.photo ?? null);
  return (
    <div className="flex size-28 items-center justify-center overflow-hidden rounded-full bg-sky ring-4 ring-white shadow-card sm:size-32">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={match?.name ?? ""}
          className="size-full object-cover"
        />
      ) : (
        <span className="font-heading text-3xl font-semibold text-primary">
          {match ? initials(match.name) : "?"}
        </span>
      )}
    </div>
  );
}

function CurrentEditionPhotos({
  token,
  eventCode,
  title,
  button,
}: {
  token: string;
  eventCode: string;
  title: string;
  button: string;
}) {
  return (
    <WinterCard>
      <CardHeader className="px-6 pt-7 pb-4 sm:px-8">
        <CardTitle className="text-xl text-foreground sm:text-2xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-7 sm:px-8">
        <Button asChild>
          <Link href={galleryPath(token, eventCode)}>{button}</Link>
        </Button>
      </CardContent>
    </WinterCard>
  );
}

export function ReceiverReveal({
  token,
  budget,
  copy,
  initiallyRevealed,
  initialMatch,
  previousGifts = [],
  currentEventCode,
  preview = false,
  previewBusy = false,
  previewError = null,
  photoSrc,
  onPreviewUnwrap,
  children,
}: {
  token: string;
  budget: string | null;
  copy: RevealCopy;
  initiallyRevealed: boolean;
  initialMatch: RevealedMatch | null;
  previousGifts?: readonly PastGift[];
  currentEventCode?: string;
  /** Render a fixture. Does not ping open, unwrap, or wishlist-seen. */
  preview?: boolean;
  previewBusy?: boolean;
  previewError?: string | null;
  photoSrc?: (filename: string | null) => string | null;
  /** Settings preview reveals the fixture locally instead of calling the API. */
  onPreviewUnwrap?: () => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(initiallyRevealed);
  const [match, setMatch] = useState(initialMatch);
  const [justUnwrapped, setJustUnwrapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showingRevealed = preview ? initiallyRevealed : revealed;
  const showingMatch = preview ? initialMatch : match;
  const showingBusy = preview ? previewBusy : busy;
  const showingError = preview ? previewError : error;
  const resolvePhoto = preview ? (photoSrc ?? photoUrl) : photoUrl;
  const currentPhotos = currentEventCode ? (
    <CurrentEditionPhotos
      token={token}
      eventCode={currentEventCode}
      title={copy.photosCurrent}
      button={copy.photosButton}
    />
  ) : null;

  useEffect(() => {
    if (preview) return;
    void requestJson(revealApiPath(token, "/open"), { method: "POST" });
  }, [preview, token]);

  useEffect(() => {
    if (preview || !revealed) return;
    void requestJson(revealApiPath(token, "/wishlist-seen"), { method: "POST" });
  }, [preview, token, revealed]);

  async function unwrap() {
    if (preview) {
      if (onPreviewUnwrap) {
        setJustUnwrapped(true);
        onPreviewUnwrap();
      }
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestJson<{ match: RevealedMatch | null }>(
      revealApiPath(token),
      { method: "POST" },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error || copy.unwrapError);
      return;
    }
    setMatch(result.data.match);
    setRevealed(true);
    setJustUnwrapped(true);
    router.refresh();
  }

  if (!showingRevealed) {
    return (
      <>
        <WinterCard>
          <CardContent className="flex flex-col items-center gap-5 px-6 pt-8 pb-7 text-center sm:px-8">
            <GiftBox
              className={cn("size-28", showingBusy && "gift-shake")}
            />
            <p className="text-base text-balance text-muted-foreground">
              {copy.readyDescription}
            </p>
            <Button
              type="button"
              size="xl"
              className="h-auto min-h-12 w-full whitespace-normal py-3 text-base sm:text-lg"
              onClick={unwrap}
              disabled={showingBusy}
            >
              <Gift aria-hidden="true" />
              <UnwrapLabel>
                {showingBusy ? copy.unwrapping : copy.unwrapButton}
              </UnwrapLabel>
            </Button>
            {showingError ? (
              <p className="text-base text-destructive">{showingError}</p>
            ) : null}
          </CardContent>
        </WinterCard>
        {children}
        {currentPhotos}
      </>
    );
  }

  const wishlist = showingMatch?.wishlist ?? [];
  const receiverVars = showingMatch ? nameVars("receiver", showingMatch) : {};
  const revealedName =
    interpolate(copy.revealedName, receiverVars).trim() ||
    showingMatch?.name ||
    "…";

  return (
    <>
      <WinterCard className={justUnwrapped ? "reveal-pop" : undefined}>
        <CardContent className="flex flex-col items-center gap-4 px-6 pt-8 pb-7 text-center sm:px-8">
          <MatchPortrait match={showingMatch} resolvePhoto={resolvePhoto} />
          <div className="space-y-1">
            <p className="font-heading text-lg text-balance text-muted-foreground">
              {interpolate(copy.revealedTitle, receiverVars)}
            </p>
            <p className="font-heading text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl">
              {revealedName}
            </p>
          </div>
          {budget ? (
            <p className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-base font-medium text-secondary-foreground">
              <Wallet className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-balance">{copy.budgetLabel}</span>
            </p>
          ) : null}

          <BerrySprig className="my-1 h-5 w-[3.75rem]" />

          <section className="w-full rounded-2xl bg-secondary/50 p-4 text-left sm:p-5">
            <h2 className="mb-3 text-center font-heading text-lg font-semibold text-foreground">
              {interpolate(copy.wishlistHeading, receiverVars)}
            </h2>
            {wishlist.length === 0 ? (
              <p className="text-center text-base text-balance text-muted-foreground">
                {interpolate(copy.wishlistEmpty, receiverVars)}
              </p>
            ) : (
              <ul className="space-y-2">
                {wishlist.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-start gap-3 rounded-xl bg-white/80 px-4 py-2.5 text-base break-words"
                  >
                    <Snowflake
                      className="mt-0.5 size-4 shrink-0 text-primary/60"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">{w.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </WinterCard>
      {children}
      {currentPhotos}
      <PreviousYears gifts={previousGifts} copy={copy} token={token} />
    </>
  );
}
