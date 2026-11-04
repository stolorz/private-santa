import type { CSSProperties } from "react";
import { Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { BerryBranch } from "@/components/festive/festive-motifs";

type Flake = {
  left: string;
  size: number;
  delay: string;
  duration: string;
  drift: string;
  opacity: number;
  restTop: string;
  kind: "dot" | "crystal";
};

const RICH_FLAKES: Flake[] = [
  { left: "4%", size: 7, delay: "0s", duration: "16s", drift: "18px", opacity: 0.9, restTop: "8%", kind: "dot" },
  { left: "11%", size: 14, delay: "2.1s", duration: "18s", drift: "-22px", opacity: 0.85, restTop: "18%", kind: "crystal" },
  { left: "18%", size: 6, delay: "5s", duration: "14s", drift: "12px", opacity: 0.9, restTop: "28%", kind: "dot" },
  { left: "26%", size: 11, delay: "1.4s", duration: "20s", drift: "26px", opacity: 0.8, restTop: "12%", kind: "crystal" },
  { left: "33%", size: 7, delay: "7.2s", duration: "15s", drift: "-14px", opacity: 0.9, restTop: "22%", kind: "dot" },
  { left: "41%", size: 8, delay: "3.6s", duration: "17s", drift: "20px", opacity: 0.85, restTop: "10%", kind: "dot" },
  { left: "48%", size: 13, delay: "0.8s", duration: "21s", drift: "-18px", opacity: 0.75, restTop: "16%", kind: "crystal" },
  { left: "55%", size: 6, delay: "6.4s", duration: "13s", drift: "10px", opacity: 0.95, restTop: "30%", kind: "dot" },
  { left: "62%", size: 12, delay: "4.2s", duration: "19s", drift: "24px", opacity: 0.8, restTop: "14%", kind: "crystal" },
  { left: "69%", size: 7, delay: "8.1s", duration: "16s", drift: "-16px", opacity: 0.9, restTop: "24%", kind: "dot" },
  { left: "76%", size: 8, delay: "2.8s", duration: "18s", drift: "14px", opacity: 0.85, restTop: "9%", kind: "dot" },
  { left: "83%", size: 14, delay: "5.5s", duration: "22s", drift: "-24px", opacity: 0.75, restTop: "20%", kind: "crystal" },
  { left: "90%", size: 6, delay: "1.1s", duration: "14s", drift: "8px", opacity: 0.9, restTop: "32%", kind: "dot" },
  { left: "95%", size: 11, delay: "9s", duration: "17s", drift: "18px", opacity: 0.8, restTop: "11%", kind: "crystal" },
  { left: "8%", size: 7, delay: "11s", duration: "15s", drift: "-10px", opacity: 0.7, restTop: "40%", kind: "dot" },
  { left: "58%", size: 6, delay: "12.4s", duration: "16s", drift: "16px", opacity: 0.75, restTop: "36%", kind: "dot" },
];

const QUIET_FLAKES: Flake[] = [
  { left: "8%", size: 6, delay: "0s", duration: "22s", drift: "10px", opacity: 0.8, restTop: "10%", kind: "dot" },
  { left: "22%", size: 10, delay: "4s", duration: "26s", drift: "-14px", opacity: 0.7, restTop: "18%", kind: "crystal" },
  { left: "39%", size: 6, delay: "8s", duration: "20s", drift: "12px", opacity: 0.75, restTop: "12%", kind: "dot" },
  { left: "57%", size: 9, delay: "2s", duration: "24s", drift: "16px", opacity: 0.65, restTop: "22%", kind: "crystal" },
  { left: "73%", size: 6, delay: "11s", duration: "21s", drift: "-8px", opacity: 0.8, restTop: "14%", kind: "dot" },
  { left: "88%", size: 8, delay: "6s", duration: "25s", drift: "10px", opacity: 0.7, restTop: "28%", kind: "dot" },
  { left: "14%", size: 5, delay: "14s", duration: "23s", drift: "6px", opacity: 0.6, restTop: "34%", kind: "dot" },
];

/** Falling snow over the viewport; content above z-0 stays in front. */
export function Snowfall({
  rich = false,
  contained = false,
}: {
  rich?: boolean;
  /** Stay inside a preview frame instead of the browser viewport. */
  contained?: boolean;
}) {
  const flakes = rich ? RICH_FLAKES : QUIET_FLAKES;
  return (
    <div
      className={cn(
        "pointer-events-none inset-0 z-0 overflow-hidden",
        contained ? "absolute" : "fixed",
      )}
      aria-hidden="true"
    >
      {flakes.map((flake, i) => (
        <span
          key={i}
          className={cn(
            "festive-snowflake",
            flake.kind === "dot" && "festive-snowflake-dot",
          )}
          style={
            {
              left: flake.left,
              width: flake.size,
              height: flake.size,
              animationDelay: flake.delay,
              animationDuration: flake.duration,
              "--drift": flake.drift,
              "--flake-opacity": String(flake.opacity),
              "--rest-top": flake.restTop,
            } as CSSProperties
          }
        >
          {flake.kind === "crystal" ? (
            <Snowflake className="size-full" strokeWidth={2.2} />
          ) : null}
        </span>
      ))}
    </div>
  );
}

/** Quiet backdrop for organiser pages: a sky wash and light snow. */
export function FestiveAtmosphere() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="festive-wash-quiet absolute inset-0" />
      <Snowfall />
      <BerryBranch className="absolute right-2 bottom-0 h-24 w-16 opacity-80" />
    </div>
  );
}
