import { describe, expect, it } from "vitest";
import { TEMPLATE_LANGUAGES } from "@/lib/templates/fields";
import {
  OG_DEFAULTS,
  OG_IMAGE_SIZE,
  REVEAL_OG_COPY,
  eventOgCopy,
  metadataFromOg,
  resolvedOgBanner,
  resolvedOgIcon,
  revealOgCopy,
} from "@/lib/og";

describe("resolvedOgIcon", () => {
  it("falls back when the stored icon is blank", () => {
    expect(resolvedOgIcon("")).toBe("/android.png");
    expect(resolvedOgIcon("   ")).toBe("/android.png");
    expect(resolvedOgIcon(null)).toBe("/android.png");
  });

  it("keeps a real icon URL", () => {
    expect(resolvedOgIcon("https://example.com/icon.png")).toBe(
      "https://example.com/icon.png",
    );
  });

  it("prefixes a relative icon that omits the leading slash", () => {
    expect(resolvedOgIcon("icon.png")).toBe("/icon.png");
  });
});

describe("resolvedOgBanner", () => {
  it("falls back to the bundled festive banner", () => {
    expect(resolvedOgBanner("")).toBe("/og-banner.jpg");
    expect(resolvedOgBanner("   ")).toBe("/og-banner.jpg");
    expect(resolvedOgBanner(null)).toBe("/og-banner.jpg");
  });

  it("keeps a real banner URL", () => {
    expect(resolvedOgBanner("https://example.com/banner.png")).toBe(
      "https://example.com/banner.png",
    );
  });
});

describe("revealOgCopy", () => {
  it("has short generic copy for every template language", () => {
    for (const lang of TEMPLATE_LANGUAGES) {
      const copy = revealOgCopy(lang);
      const expected = REVEAL_OG_COPY[lang];
      expect(copy).toEqual({
        title: expected.title,
        description: expected.description,
        locale: expected.locale,
        banner: `/og-banner-${lang}.jpg`,
        standalone: true,
      });
      expect(copy.title).not.toMatch(/\{(?:giver|receiver|event)\b/);
      expect(copy.description).not.toMatch(/\{(?:giver|receiver|event)\b/);
    }
  });

  it("falls back to English when the language is missing or unknown", () => {
    expect(revealOgCopy(undefined).title).toBe(REVEAL_OG_COPY.en.title);
    expect(revealOgCopy("fr").locale).toBe("en_US");
  });
});

describe("eventOgCopy", () => {
  it("titles the organiser link after the edition", () => {
    expect(eventOgCopy("Office party")).toEqual({
      title: "Office party",
      description: "Organise Office party: guests, exclusions and the draw.",
    });
  });
});

describe("metadataFromOg", () => {
  const defaultImage = {
    url: "/og-banner.jpg",
    width: OG_IMAGE_SIZE.width,
    height: OG_IMAGE_SIZE.height,
    alt: OG_DEFAULTS.title,
  };

  it("uses site defaults when no page copy is given", () => {
    const meta = metadataFromOg(OG_DEFAULTS);
    expect(meta.title).toBe(OG_DEFAULTS.title);
    expect(meta.description).toBe(OG_DEFAULTS.description);
    expect(meta.openGraph).toMatchObject({
      title: OG_DEFAULTS.title,
      description: OG_DEFAULTS.description,
    });
    expect(meta.openGraph?.locale).toBeUndefined();
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: OG_DEFAULTS.title,
      images: ["/og-banner.jpg"],
    });
    expect(meta.openGraph?.images).toEqual([defaultImage]);
  });

  it("prefixes the page title and overrides description on every preview field", () => {
    const meta = metadataFromOg(OG_DEFAULTS, {
      title: "Xmas 2026",
      description: "Private guest link.",
    });
    expect(meta.title).toBe("Xmas 2026 · Private Santa");
    expect(meta.description).toBe("Private guest link.");
    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.openGraph?.description).toBe("Private guest link.");
    expect(meta.twitter?.title).toBe(meta.title);
    expect(meta.twitter?.description).toBe("Private guest link.");
  });

  it("does not duplicate the site title", () => {
    const meta = metadataFromOg(OG_DEFAULTS, {
      title: OG_DEFAULTS.title,
    });
    expect(meta.title).toBe(OG_DEFAULTS.title);
  });

  it("keeps a standalone page title without the site suffix", () => {
    const copy = revealOgCopy("pl");
    const meta = metadataFromOg(OG_DEFAULTS, copy);
    expect(meta.title).toBe(copy.title);
    expect(meta.description).toBe(copy.description);
    expect(meta.openGraph).toMatchObject({
      title: copy.title,
      description: copy.description,
      locale: "pl_PL",
    });
    expect(meta.openGraph?.images).toEqual([
      {
        url: "/og-banner-pl.jpg",
        width: OG_IMAGE_SIZE.width,
        height: OG_IMAGE_SIZE.height,
        alt: copy.title,
      },
    ]);
    expect(meta.twitter?.images).toEqual(["/og-banner-pl.jpg"]);
  });

  it("falls back to the site title when standalone copy has no title", () => {
    const meta = metadataFromOg(OG_DEFAULTS, { standalone: true });
    expect(meta.title).toBe(OG_DEFAULTS.title);
  });

  it("uses a custom banner when one is set", () => {
    const meta = metadataFromOg({
      ...OG_DEFAULTS,
      banner: "https://example.com/banner.png",
    });
    expect(meta.openGraph?.images).toEqual([
      {
        url: "https://example.com/banner.png",
        width: OG_IMAGE_SIZE.width,
        height: OG_IMAGE_SIZE.height,
        alt: OG_DEFAULTS.title,
      },
    ]);
  });

  it("uses a page banner when given", () => {
    const meta = metadataFromOg(OG_DEFAULTS, {
      banner: "/og-banner-ja.jpg",
    });
    expect(meta.openGraph?.images).toEqual([
      {
        url: "/og-banner-ja.jpg",
        width: OG_IMAGE_SIZE.width,
        height: OG_IMAGE_SIZE.height,
        alt: OG_DEFAULTS.title,
      },
    ]);
  });

  it("ignores a blank locale", () => {
    const meta = metadataFromOg(OG_DEFAULTS, { locale: "   " });
    expect(meta.openGraph?.locale).toBeUndefined();
  });
});
