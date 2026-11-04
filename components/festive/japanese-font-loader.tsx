"use client";

import { useEffect } from "react";
import {
  JAPANESE_FONTS_CLASS,
  JAPANESE_FONTS_HREF,
  JAPANESE_FONTS_LINK_ID,
  containsJapanese,
} from "@/lib/japanese";

/** Injects Klee One / Zen Maru Gothic when Japanese text appears in the page. */
export function JapaneseFontLoader() {
  useEffect(() => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(schedule);

    function consider() {
      if (done) return;
      if (!containsJapanese(document.body.textContent ?? "")) return;
      done = true;
      observer.disconnect();
      if (!document.getElementById(JAPANESE_FONTS_LINK_ID)) {
        const link = document.createElement("link");
        link.id = JAPANESE_FONTS_LINK_ID;
        link.rel = "stylesheet";
        link.href = JAPANESE_FONTS_HREF;
        document.head.appendChild(link);
      }
      document.documentElement.classList.add(JAPANESE_FONTS_CLASS);
    }

    function schedule() {
      if (done) return;
      clearTimeout(timer);
      timer = setTimeout(consider, 160);
    }

    consider();
    if (!done) {
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return null;
}
