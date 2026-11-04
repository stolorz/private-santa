/**
 * Rasterise the winter illustration for places that cannot show inline SVG:
 * the HTML email banner and the link-preview (OpenGraph) images.
 *
 * Latin OG titles use Playpen Sans; Japanese uses Klee One. Both are OFL
 * fonts fetched into `scripts/fonts/` (gitignored) so we can outline glyphs
 * without depending on the machine's installed fonts.
 *
 *   npm run email:art
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import opentype from "opentype.js";
import type { Font } from "opentype.js";
import sharp from "sharp";
import { GiftBox, WINTER } from "@/components/festive/festive-motifs";
import { WinterLandscape } from "@/components/festive/winter-scene";
import {
  OG_DEFAULT_BANNER,
  OG_IMAGE_SIZE,
  revealOgCopy,
} from "@/lib/og";
import {
  EMAIL_BANNER_PATH,
  EMAIL_BANNER_SIZE,
} from "@/lib/templates/email";
import { TEMPLATE_LANGUAGES } from "@/lib/templates/fields";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const FONT_DIR = path.join(process.cwd(), "scripts/fonts");
const GIFT_SIZE = 190;
const TITLE_MAX_WIDTH_RATIO = 0.84;
const TITLE_PREFERRED_SIZE = 78;
const TITLE_MIN_SIZE = 36;
const TITLE_CENTER_Y_RATIO = 0.28;

type FontSpec = {
  file: string;
  urls: readonly string[];
};

const FONTS = {
  playpen: {
    file: "PlaypenSans-SemiBold.ttf",
    urls: [
      "https://cdn.jsdelivr.net/fontsource/fonts/playpen-sans@5.2.8/latin-600-normal.ttf",
      "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/playpensans/PlaypenSans%5Bwght%5D.ttf",
    ],
  },
  klee: {
    file: "KleeOne-SemiBold.ttf",
    urls: [
      "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/kleeone/KleeOne-SemiBold.ttf",
      "https://github.com/google/fonts/raw/main/ofl/kleeone/KleeOne-SemiBold.ttf",
    ],
  },
} as const satisfies Record<string, FontSpec>;

function svgBuffer(element: ReactElement): Buffer {
  const markup = renderToStaticMarkup(element);
  return Buffer.from(
    markup.includes("xmlns=")
      ? markup
      : markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'),
  );
}

async function save(publicPath: string, data: Buffer) {
  const file = path.join(PUBLIC_DIR, publicPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  console.log(`${path.relative(process.cwd(), file)} (${Math.round(data.length / 1024)} KB)`);
}

function looksLikeFont(data: Buffer): boolean {
  if (data.length < 16) return false;
  const head = data.subarray(0, 4).toString("binary");
  return (
    head === "\x00\x01\x00\x00" ||
    head === "OTTO" ||
    head === "wOFF" ||
    head === "true"
  );
}

async function downloadFont(spec: FontSpec): Promise<Buffer> {
  const dest = path.join(FONT_DIR, spec.file);
  try {
    const cached = await readFile(dest);
    if (looksLikeFont(cached)) return cached;
  } catch (error) {
    if ((error as { code: unknown }).code !== "ENOENT") throw error;
  }

  const errors: string[] = [];
  for (const url of spec.urls) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        errors.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (!looksLikeFont(data)) {
        errors.push(`${url} → not a font`);
        continue;
      }
      await mkdir(FONT_DIR, { recursive: true });
      await writeFile(dest, data);
      return data;
    } catch (e) {
      errors.push(`${url} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Could not download ${spec.file}:\n${errors.join("\n")}`);
}

function loadFont(data: Buffer): Font {
  return opentype.parse(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
}

function assertGlyphs(font: Font, text: string, label: string) {
  for (const ch of text) {
    if (ch === " ") continue;
    if (!font.hasChar(ch)) {
      throw new Error(`${label} is missing a glyph for ${JSON.stringify(ch)}`);
    }
  }
}

function fitFontSize(
  font: Font,
  text: string,
  maxWidth: number,
): number {
  let size = TITLE_PREFERRED_SIZE;
  while (size > TITLE_MIN_SIZE) {
    if (font.getAdvanceWidth(text, size) <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

function titleOverlaySvg(
  font: Font,
  text: string,
  width: number,
  height: number,
): Buffer {
  const size = fitFontSize(font, text, width * TITLE_MAX_WIDTH_RATIO);
  const origin = font.getPath(text, 0, 0, size);
  const box = origin.getBoundingBox();
  const dx = width / 2 - (box.x1 + box.x2) / 2;
  const dy = height * TITLE_CENTER_Y_RATIO - (box.y1 + box.y2) / 2;
  const placed = font.getPath(text, dx, dy, size);
  const d = placed.toPathData(2);
  const stroke = Math.max(10, Math.round(size * 0.16));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<path d="${d}" fill="none" stroke="${WINTER.snow}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${d}" fill="${WINTER.ink}"/>` +
      `</svg>`,
  );
}

async function emailBanner() {
  const scale = 2;
  const { width, height } = EMAIL_BANNER_SIZE;
  const png = await sharp(
    svgBuffer(
      <WinterLandscape
        sky
        snow="#ffffff"
        animate={false}
        viewBox="330 43 1000 357"
        width={width * scale}
        height={height * scale}
      />,
    ),
  )
    .png({ palette: true, quality: 92, compressionLevel: 9 })
    .toBuffer();
  await save(EMAIL_BANNER_PATH, png);
}

async function ogBannerBase(): Promise<Buffer> {
  const { width, height } = OG_IMAGE_SIZE;
  const gift = await sharp(svgBuffer(<GiftBox />), {
    density: 72 * (GIFT_SIZE / 120) * 1.5,
  })
    .resize(GIFT_SIZE, GIFT_SIZE)
    .png()
    .toBuffer();
  return sharp(
    svgBuffer(
      <WinterLandscape
        sky
        animate={false}
        viewBox="430 -40 820 430"
        width={width}
        height={height}
      />,
    ),
  )
    .composite([
      {
        input: gift,
        left: Math.round((width - GIFT_SIZE) / 2),
        top: height - GIFT_SIZE - 12,
      },
    ])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

async function ogBanners() {
  const { width, height } = OG_IMAGE_SIZE;
  const [base, playpenData, kleeData] = await Promise.all([
    ogBannerBase(),
    downloadFont(FONTS.playpen),
    downloadFont(FONTS.klee),
  ]);
  await save(OG_DEFAULT_BANNER, base);

  const playpen = loadFont(playpenData);
  const klee = loadFont(kleeData);

  for (const lang of TEMPLATE_LANGUAGES) {
    const copy = revealOgCopy(lang);
    const font = lang === "ja" ? klee : playpen;
    assertGlyphs(font, copy.title, `${copy.banner} (${lang})`);
    const jpg = await sharp(base)
      .composite([{ input: titleOverlaySvg(font, copy.title, width, height) }])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    await save(copy.banner, jpg);
  }
}

await emailBanner();
await ogBanners();
