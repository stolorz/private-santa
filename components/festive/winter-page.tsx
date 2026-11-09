import type { ComponentProps, ReactNode } from "react";
import { Gift, Snowflake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BerrySprig } from "@/components/festive/festive-motifs";
import { Snowfall } from "@/components/festive/festive-atmosphere";
import {
  WinterForeground,
  WinterMobileCorners,
  WinterSides,
} from "@/components/festive/winter-scene";
import { JapaneseGreeting } from "@/components/festive/japanese-greeting";
import {
  JAPANESE_FONTS_CLASS,
  JAPANESE_FONTS_HREF,
  JAPANESE_FONTS_LINK_ID,
  containsJapanese,
} from "@/lib/japanese";

const SKY_SPARKLES = [
  { className: "top-8 left-[6%] size-5 lg:top-16", delay: "0s" },
  { className: "top-5 right-[8%] size-6 lg:top-12", delay: "1.2s" },
  { className: "top-24 right-[5%] size-4 lg:top-32", delay: "2s" },
  { className: "top-28 left-[12%] hidden size-4 sm:block", delay: "0.6s" },
  { className: "top-20 left-[22%] hidden size-3 md:block", delay: "1.8s" },
  { className: "top-24 right-[22%] hidden size-3 md:block", delay: "2.6s" },
];

/**
 * Guest-facing page: a handwritten title in the sky with the content right
 * below it. Wide screens frame the column with layered side scenes; small
 * screens keep decorations in the corners and along the bottom.
 */
function nodeText(node: ReactNode | undefined): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return "";
}

export function WinterPage({
  title,
  subtitle,
  children,
  brand = true,
  sprig = true,
  contained = false,
  wide = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  brand?: boolean;
  sprig?: boolean;
  /** Clip the sky and snowfall to this frame. Used by the template preview. */
  contained?: boolean;
  /** Guest galleries: keep the phone column, widen from `lg` for extra thumbs. */
  wide?: boolean;
}) {
  const japanese = containsJapanese(`${nodeText(title)}\n${nodeText(subtitle)}`);
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-x-clip bg-snow",
        contained ? "min-h-[40rem] overflow-hidden" : "min-h-screen",
        japanese && JAPANESE_FONTS_CLASS,
      )}
    >
      {japanese ? (
        <link
          id={JAPANESE_FONTS_LINK_ID}
          rel="stylesheet"
          href={JAPANESE_FONTS_HREF}
        />
      ) : null}
      <div
        aria-hidden="true"
        className={cn(
          "winter-backdrop pointer-events-none inset-0",
          contained ? "absolute" : "fixed",
        )}
      />
      <WinterSides contained={contained} />
      <WinterMobileCorners />
      <div className="relative">
        {SKY_SPARKLES.map((sparkle) => (
          <Snowflake
            key={sparkle.className}
            aria-hidden="true"
            strokeWidth={1.5}
            className={cn(
              "festive-twinkle absolute text-white drop-shadow-[0_1px_1px_rgb(71_99_127/0.3)]",
              sparkle.className,
            )}
            style={{ animationDelay: sparkle.delay }}
          />
        ))}
        {brand ? (
          <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-2 px-5 pt-3 font-heading text-sm font-medium text-foreground sm:px-8 sm:pt-5 sm:text-base lg:pt-6">
            <Gift className="size-5" strokeWidth={1.6} aria-hidden="true" />
            Private Santa
          </header>
        ) : null}
        <div
          className={cn(
            "relative z-10 mx-auto max-w-xl px-6 text-center",
            brand ? "pt-2 sm:pt-4 lg:pt-6" : "pt-5 sm:pt-8 lg:pt-10",
          )}
        >
          {japanese ? (
            <JapaneseGreeting className="font-heading leading-[1.15] font-semibold tracking-tight text-foreground text-[1.6rem] sm:text-5xl lg:text-6xl">
              {title}
            </JapaneseGreeting>
          ) : (
            <h1 className="font-heading leading-[1.15] font-semibold tracking-tight text-foreground text-[1.85rem] text-balance sm:text-5xl lg:text-6xl">
              {title}
            </h1>
          )}
          {subtitle ? (
            <p className="mx-auto mt-1.5 max-w-md font-heading text-sm text-balance text-muted-foreground sm:mt-2 sm:text-base lg:text-lg">
              {subtitle}
            </p>
          ) : null}
          {sprig ? (
            <BerrySprig className="mx-auto mt-2 h-5 w-[3.75rem] sm:mt-3" />
          ) : null}
        </div>
      </div>
      <Snowfall rich contained={contained} />
      <main className="relative z-10 mt-4 flex-1 px-4 sm:mt-5 lg:mt-8 lg:pb-16">
        <div
          className={cn(
            "mx-auto w-full max-w-md space-y-6",
            wide && "lg:max-w-4xl",
          )}
        >
          {children}
        </div>
      </main>
      <WinterForeground className="lg:hidden" />
    </div>
  );
}

export function WinterCard({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        "rounded-[1.75rem] border-white/80",
        className,
      )}
      {...props}
    />
  );
}
