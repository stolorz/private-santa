"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Matches `text-fit: shrink 60%` in app/globals.css. */
const FIT_FLOOR = 0.6;

type FitMode = "plain" | "line" | "wrap";

function greetingContent(children: ReactNode): ReactNode {
  if (typeof children !== "string") return children;
  const split = children.match(/^(.*?)([、,][\s\S]*)$/);
  if (!split?.[1] || !split[2]) return children;
  return (
    <>
      {split[1]}
      <span className="whitespace-nowrap">{split[2]}</span>
    </>
  );
}

function fitsOnOneLine(heading: HTMLElement): boolean {
  const available = heading.clientWidth;
  if (available <= 0) return false;
  const size = parseFloat(getComputedStyle(heading).fontSize);
  if (!Number.isFinite(size) || size <= 0) return false;
  const style = getComputedStyle(heading);
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.whiteSpace = "nowrap";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.font = style.font;
  probe.style.letterSpacing = style.letterSpacing;
  probe.style.fontSize = `${size * FIT_FLOOR}px`;
  probe.textContent = heading.textContent;
  heading.appendChild(probe);
  const width = probe.getBoundingClientRect().width || probe.scrollWidth;
  probe.remove();
  return width <= available;
}

/**
 * Japanese page title. Chrome keeps it on one line by shrinking down to
 * 60%. Past that floor, and in every other browser, it wraps.
 */
export function JapaneseGreeting({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<FitMode>("plain");

  useLayoutEffect(() => {
    const heading = ref.current;
    if (
      !heading ||
      typeof CSS === "undefined" ||
      !CSS.supports("text-fit", "shrink")
    ) {
      return;
    }

    let measuring = false;
    const measure = () => {
      if (measuring || !heading.isConnected) return;
      measuring = true;
      const next: FitMode = fitsOnOneLine(heading) ? "line" : "wrap";
      measuring = false;
      setMode((current) => (current === next ? current : next));
    };

    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(heading);
    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", measure);
    void fonts?.ready.then(() => {
      if (heading.isConnected) measure();
    });
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener("loadingdone", measure);
    };
  }, [children]);

  return (
    <h1
      ref={ref}
      className={cn(
        className,
        mode === "line" && "jp-fit-line",
        mode === "wrap" && "text-balance",
      )}
    >
      {greetingContent(children)}
    </h1>
  );
}
