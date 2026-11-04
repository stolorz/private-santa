import { containsJapanese } from "@/lib/japanese";
import {
  resolveTemplateLanguage,
  type TemplateId,
  type TemplatesView,
  type TemplateVars,
} from "./fields";
import { interpolate, parseTemplatePlaceholders } from "./parse";
import { renderTemplate } from "./render";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

/** Re-run `npm run email:art` after changing the landscape illustration. */
export const EMAIL_BANNER_PATH = "/email/winter-banner.png";
export const EMAIL_BANNER_SIZE = { width: 560, height: 200 } as const;
/** Matches the inline PNG attached in `lib/email.ts`. */
export const EMAIL_BANNER_CID = "winter-banner";

const PAGE_BG = "#e6eef6";
const CARD_BG = "#ffffff";
const CARD_BORDER = "#d6e2ee";
const BODY_TEXT = "#1f3550";
const FLOURISH = "#a9bdd2";
const BUTTON_BG = "#47637f";
const BUTTON_FG = "#f6f9fc";

type Faces = { font: string; hand: string; href: string };

const LATIN_FACES: Faces = {
  font: "'Nunito','Segoe UI',Helvetica,Arial,sans-serif",
  hand: "'Playpen Sans','Nunito','Segoe UI',Helvetica,Arial,sans-serif",
  href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&family=Playpen+Sans:wght@500;600&display=swap",
};

const JAPANESE_FACES: Faces = {
  font: "'Nunito','Zen Maru Gothic','Segoe UI',Helvetica,Arial,sans-serif",
  hand: "'Playpen Sans','Klee One','Nunito','Zen Maru Gothic','Segoe UI',Helvetica,Arial,sans-serif",
  href: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&family=Playpen+Sans:wght@500;600&family=Klee+One:wght@400;600&family=Zen+Maru+Gothic:wght@400;500;700&display=swap",
};

function facesFor(...parts: string[]): Faces {
  return parts.some(containsJapanese) ? JAPANESE_FACES : LATIN_FACES;
}

const HEADING_MAX_CHARS = 80;

type Inline =
  | { kind: "text"; text: string }
  | { kind: "url"; href: string }
  | { kind: "button" };

export type EmailFieldIds = {
  subject: TemplateId;
  body: TemplateId;
  button: TemplateId;
};

export const INVITATION_EMAIL_FIELDS: EmailFieldIds = {
  subject: "email.subject",
  body: "email.body",
  button: "email.button",
};

/** Wishlist-notice subject, body, and button. Shared by the sender and the preview. */
export const WISHLIST_EMAIL_FIELDS: Record<
  "added" | "removed" | "changed",
  EmailFieldIds
> = {
  added: {
    subject: "email.wishlist_added.subject",
    body: "email.wishlist_added.body",
    button: "email.wishlist_button",
  },
  removed: {
    subject: "email.wishlist_removed.subject",
    body: "email.wishlist_removed.body",
    button: "email.wishlist_button",
  },
  changed: {
    subject: "email.wishlist_changed.subject",
    body: "email.wishlist_changed.body",
    button: "email.wishlist_button",
  },
};

/** Wishlist-notice Signal body. Shared by the sender and the preview. */
export const WISHLIST_SIGNAL_BODY: Record<
  "added" | "removed" | "changed",
  TemplateId
> = {
  added: "signal.wishlist_added.body",
  removed: "signal.wishlist_removed.body",
  changed: "signal.wishlist_changed.body",
};

export type RenderEmailOptions = {
  /** Replaces the CID banner so a browser preview can load the PNG. */
  bannerSrc?: string;
  /** Defaults to the invitation subject, body, and button. */
  fields?: EmailFieldIds;
};

export function renderEmail(
  view: TemplatesView,
  language: string,
  vars: TemplateVars = {},
  options?: RenderEmailOptions,
): RenderedEmail {
  const lang = resolveTemplateLanguage(language);
  const fields = options?.fields ?? INVITATION_EMAIL_FIELDS;
  const url = vars.url ?? "";
  const label = renderTemplate(view, fields.button, lang, vars);
  const body = view[lang][fields.body];
  const subject = renderTemplate(view, fields.subject, lang, vars);
  const text = interpolate(
    body,
    {
      ...vars,
      button: url ? `${label}\n${url}` : label,
    },
    lang,
  ).replace(/^[ \t]+/gm, "");
  const faces = facesFor(subject, text);
  return {
    subject,
    text,
    html: wrapEmailHtml(
      htmlFromBody(body, vars, label, url, faces, lang),
      lang,
      faces,
      options?.bannerSrc,
    ),
  };
}

/** Plain text in the same card layout, for mail without a template. */
export function plainEmailHtml(text: string, language = "en"): string {
  const faces = facesFor(text);
  const blocks = splitBlocks([{ kind: "text", text }]);
  return wrapEmailHtml(
    blocks.map((block) => renderBlock(block, "", "", faces)).join(""),
    resolveTemplateLanguage(language),
    faces,
  );
}

function htmlFromBody(
  template: string,
  vars: TemplateVars,
  label: string,
  url: string,
  faces: Faces,
  language: string,
): string {
  const blocks = splitBlocks(bodyInlines(template, vars, language));
  const heading = blocks.length > 1 ? headingText(blocks[0]) : null;
  const rest = heading == null ? blocks : blocks.slice(1);
  return (
    (heading == null ? "" : renderHeading(heading, faces)) +
    rest.map((block) => renderBlock(block, label, url, faces)).join("")
  );
}

/** A short single-line first block (the greeting) becomes the heading. */
function headingText(block: Inline[]): string | null {
  if (block.length !== 1) return null;
  const [part] = block;
  if (part?.kind !== "text") return null;
  if (/\r?\n/.test(part.text) || part.text.length > HEADING_MAX_CHARS) {
    return null;
  }
  return part.text;
}

function bodyInlines(
  template: string,
  vars: TemplateVars,
  language: string,
): Inline[] {
  const spans = parseTemplatePlaceholders(template);
  const out: Inline[] = [];
  let i = 0;

  function pushText(text: string) {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.kind === "text") last.text += text;
    else out.push({ kind: "text", text });
  }

  for (const span of spans) {
    if (span.start > i) pushText(template.slice(i, span.start));
    const token = template.slice(span.start, span.end);
    if (span.known && !span.select && span.name === "button") {
      out.push({ kind: "button" });
    } else if (span.known && !span.select && span.name === "url" && vars.url) {
      out.push({ kind: "url", href: vars.url });
    } else {
      pushText(interpolate(token, vars, language));
    }
    i = span.end;
  }
  if (i < template.length) pushText(template.slice(i));
  return out;
}

function splitBlocks(inlines: Inline[]): Inline[][] {
  const blocks: Inline[][] = [];
  let current: Inline[] = [];

  function flush() {
    const trimmed = trimBlock(current);
    if (trimmed.length > 0) blocks.push(trimmed);
    current = [];
  }

  function addText(text: string) {
    const parts = text.split(/\r?\n[ \t]*\r?\n/);
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) flush();
      if (parts[i]) current.push({ kind: "text", text: parts[i] });
    }
  }

  for (const part of inlines) {
    if (part.kind === "text") addText(part.text);
    else current.push(part);
  }
  flush();
  return blocks;
}

function trimBlock(block: Inline[]): Inline[] {
  const next = [...block];
  while (next[0]?.kind === "text") {
    const text = next[0].text.replace(/^\s+/, "");
    if (text) {
      next[0] = { kind: "text", text };
      break;
    }
    next.shift();
  }
  while (next.length > 0) {
    const last = next[next.length - 1];
    if (last.kind !== "text") break;
    const text = last.text.replace(/\s+$/, "");
    if (text) {
      next[next.length - 1] = { kind: "text", text };
      break;
    }
    next.pop();
  }
  return next;
}

function isButtonOnly(block: Inline[]): boolean {
  const parts = block.filter(
    (part) => part.kind !== "text" || part.text.trim() !== "",
  );
  return parts.length === 1 && parts[0]?.kind === "button";
}

type ParagraphInline = Exclude<Inline, { kind: "button" }>;

function renderBlock(
  block: Inline[],
  label: string,
  url: string,
  faces: Faces,
): string {
  if (isButtonOnly(block)) return ctaTable(label, url, faces);
  const chunks: string[] = [];
  let para: ParagraphInline[] = [];
  function flushPara() {
    const html = renderParagraph(para, faces);
    if (html) chunks.push(html);
    para = [];
  }
  for (const part of block) {
    if (part.kind === "button") {
      flushPara();
      chunks.push(ctaTable(label, url, faces));
    } else {
      para.push(part);
    }
  }
  flushPara();
  return chunks.join("");
}

function renderHeading(text: string, faces: Faces): string {
  return `<h1 style="margin:0 0 14px;font-family:${faces.hand};font-size:28px;line-height:1.25;font-weight:600;color:${BODY_TEXT};">${escapeHtml(text)}</h1>`;
}

function renderParagraph(parts: ParagraphInline[], faces: Faces): string {
  if (parts.length === 0) return "";
  const inner = parts
    .map((part) =>
      part.kind === "text"
        ? escapeHtml(part.text).replace(/\r?\n/g, "<br>")
        : urlLink(part.href),
    )
    .join("");
  return `<p style="margin:0 0 16px;font-family:${faces.font};font-size:16px;line-height:1.6;color:${BODY_TEXT};">${inner}</p>`;
}

function urlLink(href: string): string {
  const safe = escapeAttr(href);
  return `<a href="${safe}" style="color:${BUTTON_BG};text-decoration:underline;">${escapeHtml(href)}</a>`;
}

function ctaTable(label: string, url: string, faces: Faces): string {
  const href = escapeAttr(url);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" bgcolor="${BUTTON_BG}" style="background-color:${BUTTON_BG};border-radius:14px;"><a href="${href}" style="display:block;padding:15px 24px;font-family:${faces.hand};font-size:17px;font-weight:600;line-height:1.3;color:${BUTTON_FG};text-decoration:none;text-align:center;">${escapeHtml(label)}</a></td></tr></table>`;
}

function bannerAddress(bannerSrc?: string): string {
  const src = bannerSrc?.trim();
  return src ? src : `cid:${EMAIL_BANNER_CID}`;
}

function bannerRow(src: string): string {
  const { width, height } = EMAIL_BANNER_SIZE;
  return `<tr><td style="padding:0;font-size:0;line-height:0;"><img src="${escapeAttr(src)}" width="${width}" height="${height}" alt="" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:24px 24px 0 0;"></td></tr>`;
}

function wrapEmailHtml(
  inner: string,
  lang: string,
  faces: Faces,
  bannerSrc?: string,
): string {
  return `<!DOCTYPE html><html lang="${escapeAttr(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><link href="${faces.href}" rel="stylesheet"></head><body style="margin:0;padding:0;background-color:${PAGE_BG};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};"><tr><td align="center" style="padding:28px 12px 36px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td bgcolor="${CARD_BG}" style="background-color:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bannerRow(bannerAddress(bannerSrc))}<tr><td style="padding:12px 32px 16px;font-family:${faces.font};font-size:16px;line-height:1.6;color:${BODY_TEXT};">${inner}</td></tr></table></td></tr><tr><td align="center" style="padding:20px 0 0;font-family:${faces.font};font-size:14px;letter-spacing:10px;color:${FLOURISH};">&#10054;&#10053;&#10054;</td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
