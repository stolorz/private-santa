import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEMPLATE_IDS,
  TEMPLATE_LANGUAGES,
  applyTemplatesPatch,
  cloneTemplatesView,
  emptyTemplatesView,
  type TemplateLanguage,
  type TemplatesPatch,
  type TemplatesView,
} from "@/lib/templates/fields";

const COMMITTED_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "defaults",
);

let overrideDir: string | null = null;
let cache: TemplatesView | null = null;

export function templateDefaultsDir(): string {
  return overrideDir ?? COMMITTED_DIR;
}

export function setTemplateDefaultsDir(dir: string | null): void {
  overrideDir = dir;
  cache = null;
}

export function resetTemplateDefaultsCache(): void {
  overrideDir = null;
  cache = null;
}

function languageFile(lang: TemplateLanguage): string {
  return path.join(templateDefaultsDir(), `${lang}.json`);
}

function parseLanguageFile(
  lang: TemplateLanguage,
  raw: string,
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Template defaults for ${lang} are not an object.`);
  }
  return parsed as Record<string, unknown>;
}

export function readReferenceTemplates(): TemplatesView {
  if (cache) return cache;
  const view = emptyTemplatesView();
  for (const lang of TEMPLATE_LANGUAGES) {
    const file = languageFile(lang);
    if (!fs.existsSync(file)) continue;
    const parsed = parseLanguageFile(lang, fs.readFileSync(file, "utf8"));
    for (const id of TEMPLATE_IDS) {
      const value = parsed[id];
      if (typeof value === "string") view[lang][id] = value;
    }
  }
  cache = view;
  return view;
}

function serializeLanguage(fields: Record<string, string>): string {
  const ordered: Record<string, string> = {};
  for (const id of TEMPLATE_IDS) ordered[id] = fields[id] ?? "";
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function writeLanguageFile(
  lang: TemplateLanguage,
  fields: Record<string, string>,
): void {
  const file = languageFile(lang);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, serializeLanguage(fields));
  fs.renameSync(tmp, file);
}

export function writeReferenceTemplates(view: TemplatesView): void {
  for (const lang of TEMPLATE_LANGUAGES) {
    writeLanguageFile(lang, view[lang]);
  }
  cache = cloneTemplatesView(view);
}

export async function getTemplates(): Promise<TemplatesView> {
  return cloneTemplatesView(readReferenceTemplates());
}

export async function setTemplates(
  patch: TemplatesPatch,
): Promise<TemplatesView> {
  if (process.env.VITEST && overrideDir == null) {
    throw new Error(
      "Tests must call useTempTemplateDefaults() before setTemplates.",
    );
  }
  const next = applyTemplatesPatch(readReferenceTemplates(), patch);
  writeReferenceTemplates(next);
  return cloneTemplatesView(next);
}
