import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATE_LANGUAGES } from "@/lib/templates/fields";
import { setTemplateDefaultsDir } from "@/lib/templates/reference";

const COMMITTED_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../lib/templates/defaults",
);

export function committedTemplateDefaultsDir(): string {
  return COMMITTED_DIR;
}

/** Copy the committed JSON into a temp dir and point the reference store at it. */
export function useTempTemplateDefaults(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "santa-tpl-"));
  for (const lang of TEMPLATE_LANGUAGES) {
    fs.copyFileSync(
      path.join(COMMITTED_DIR, `${lang}.json`),
      path.join(dir, `${lang}.json`),
    );
  }
  setTemplateDefaultsDir(dir);
  return dir;
}
