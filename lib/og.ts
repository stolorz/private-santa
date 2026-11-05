import type { Metadata } from "next";
import { apiPath, publicOrigin } from "@/lib/public-path";
import {
  resolveTemplateLanguage,
  type TemplateLanguage,
} from "@/lib/templates/fields";

export interface OgSettings {
  title: string;
  description: string;
  icon: string;
  banner: string;
}

export const OG_DEFAULTS: OgSettings = {
  title: "Private Santa",
  description:
    "Run a private Secret Santa with exclusions, wishlists, and a link for each guest.",
  icon: "",
  banner: "",
};

const DEFAULT_ICON = "/android.png";
export const OG_DEFAULT_BANNER = "/og-banner.jpg";
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

function publicOgUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return apiPath(url.startsWith("/") ? url : `/${url}`);
}

/** Favicon URL, or the bundled icon when the admin field is blank. */
export function resolvedOgIcon(icon: string | null | undefined): string {
  const s = icon?.trim() ?? "";
  return publicOgUrl(s || DEFAULT_ICON);
}

/** Link-preview banner, or the bundled festive banner when blank. */
export function resolvedOgBanner(banner: string | null | undefined): string {
  const s = banner?.trim() ?? "";
  return publicOgUrl(s || OG_DEFAULT_BANNER);
}

export type OgPageCopy = {
  title?: string;
  description?: string;
  banner?: string;
  locale?: string;
  /** When true, do not append ` · {site title}`. */
  standalone?: boolean;
};

/**
 * Guest-link preview text, one set per language. Never includes giver,
 * receiver, or edition names — crawlers would spoil the draw.
 */
export const REVEAL_OG_COPY: Record<
  TemplateLanguage,
  { title: string; description: string; locale: string }
> = {
  en: {
    title: "Secret Santa",
    description: "Open to see who you're buying for.",
    locale: "en_US",
  },
  pl: {
    title: "Gwiazdkowe losowanie",
    description: "Otwórz, żeby zobaczyć, komu kupujesz prezent.",
    locale: "pl_PL",
  },
  de: {
    title: "Wichteln",
    description: "Öffne den Link, um zu sehen, für wen du einkaufst.",
    locale: "de_DE",
  },
  es: {
    title: "Amigo invisible",
    description: "Abre el enlace para ver a quién le tocas.",
    locale: "es_ES",
  },
  ja: {
    title: "シークレットサンタ",
    description: "リンクを開いて、贈る相手を確認しましょう。",
    locale: "ja_JP",
  },
};

/** Language follows the giver. Copy is generic so the card cannot leak the match. */
export function revealOgCopy(language: string | null | undefined): {
  title: string;
  description: string;
  locale: string;
  banner: string;
  standalone: true;
} {
  const lang = resolveTemplateLanguage(language);
  const copy = REVEAL_OG_COPY[lang];
  return {
    title: copy.title,
    description: copy.description,
    locale: copy.locale,
    banner: `/og-banner-${lang}.jpg`,
    standalone: true,
  };
}

export function eventOgCopy(eventName: string): OgPageCopy {
  const name = eventName.trim();
  return {
    title: name,
    description: `Organise ${name}: guests, exclusions and the draw.`,
  };
}

function ogTitle(og: OgSettings, page?: OgPageCopy): string {
  const site = og.title.trim();
  const pageTitle = page?.title?.trim();
  if (!pageTitle) return site;
  if (page?.standalone || pageTitle === site) return pageTitle;
  return `${pageTitle} · ${site}`;
}

/**
 * Site defaults plus an optional per-URL title/description. Child pages
 * must set `openGraph` / `twitter` themselves — Next only shallow-merges
 * those objects, so a title-only return would leave the homepage OG tags.
 */
export function metadataFromOg(
  og: OgSettings,
  page?: OgPageCopy,
): Metadata {
  const title = ogTitle(og, page);
  const description = page?.description?.trim() || og.description;
  const banner = resolvedOgBanner(page?.banner || og.banner);
  const locale = page?.locale?.trim();
  const images = [
    {
      url: banner,
      width: OG_IMAGE_SIZE.width,
      height: OG_IMAGE_SIZE.height,
      alt: title,
    },
  ];
  return {
    metadataBase: new URL(publicOrigin()),
    title,
    description,
    icons: {
      icon: resolvedOgIcon(og.icon),
      apple: apiPath("/ios.png"),
    },
    openGraph: {
      title,
      description,
      images,
      ...(locale ? { locale } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [banner],
    },
  };
}
