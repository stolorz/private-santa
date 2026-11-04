import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEMPLATE_DEFAULTS,
  TEMPLATE_IDS,
  TEMPLATE_LANGUAGES,
} from "@/lib/templates/fields";
import {
  getTemplates,
  setTemplateDefaultsDir,
  setTemplates,
  templateDefaultsDir,
  writeReferenceTemplates,
} from "@/lib/templates/reference";
import {
  committedTemplateDefaultsDir,
  useTempTemplateDefaults,
} from "@/test/helpers/template-defaults";

describe("committed template JSON", () => {
  it("contains every language and field, matching the extracted defaults", () => {
    const dir = committedTemplateDefaultsDir();
    for (const lang of TEMPLATE_LANGUAGES) {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(dir, `${lang}.json`), "utf8"),
      ) as Record<string, string>;
      expect(Object.keys(parsed)).toEqual([...TEMPLATE_IDS]);
      expect(parsed["email.button"]).toBe(
        TEMPLATE_DEFAULTS[lang]["email.button"],
      );
      expect(parsed["email.body"]).toContain("{button}");
      expect(parsed["signal.body"]).toContain("\n\n{url}\n\n");
      expect(parsed["reveal.previous_row"]).toContain("{year}");
    }
    expect(
      JSON.parse(
        fs.readFileSync(path.join(dir, "en.json"), "utf8"),
      )["email.button"],
    ).toBe("See who you're gifting!");
    expect(
      JSON.parse(
        fs.readFileSync(path.join(dir, "pl.json"), "utf8"),
      )["reveal.revealed_name"],
    ).toBe("{receiver_biernik}");
  });
});

describe("getTemplates / setTemplates", () => {
  it("refuses to write the committed files from Vitest", async () => {
    await expect(
      setTemplates({ en: { "email.subject": "nope" } }),
    ).rejects.toThrow(/useTempTemplateDefaults/);
  });

  describe("in a temp directory", () => {
    beforeEach(() => {
      useTempTemplateDefaults();
    });

  it("reads the JSON files and keeps a later write after a cache-warming read", async () => {
    const before = await getTemplates();
    expect(before.en["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.en["email.subject"],
    );
    await getTemplates();
    await setTemplates({
      en: { "email.body": "Custom email body", "email.subject": "" },
    });
    const after = await getTemplates();
    expect(after.en["email.body"]).toBe("Custom email body");
    expect(after.en["email.subject"]).toBe("");
    expect(after.pl["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.pl["email.subject"],
    );
  });

  it("writes an empty string when a template id is missing from the view", async () => {
    const view = await getTemplates();
    delete (view.en as Record<string, string | undefined>)["email.subject"];
    writeReferenceTemplates(view);
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(templateDefaultsDir(), "en.json"), "utf8"),
    ) as Record<string, string>;
    expect(onDisk["email.subject"]).toBe("");
  });

  it("writes the literal default string back instead of deleting the field", async () => {
    const original = TEMPLATE_DEFAULTS.en["email.subject"];
    await setTemplates({ en: { "email.subject": "Draw {event}" } });
    await setTemplates({ en: { "email.subject": original } });
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(templateDefaultsDir(), "en.json"), "utf8"),
    ) as Record<string, string>;
    expect(onDisk["email.subject"]).toBe(original);
    expect((await getTemplates()).en["email.subject"]).toBe(original);
  });

  it("does not write the committed JSON files", async () => {
    const file = path.join(committedTemplateDefaultsDir(), "en.json");
    const before = fs.readFileSync(file, "utf8");
    await setTemplates({ en: { "email.subject": "Only in the temp copy" } });
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect((await getTemplates()).en["email.subject"]).toBe(
      "Only in the temp copy",
    );
  });

  it("fills a missing language file from the bundled defaults", async () => {
    fs.unlinkSync(path.join(templateDefaultsDir(), "ja.json"));
    setTemplateDefaultsDir(templateDefaultsDir());
    const view = await getTemplates();
    expect(view.ja["reveal.greeting"]).toBe(
      TEMPLATE_DEFAULTS.ja["reveal.greeting"],
    );
  });

  it("ignores non-string values in a language file", async () => {
    const file = path.join(templateDefaultsDir(), "en.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    parsed["email.subject"] = 12;
    fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
    setTemplateDefaultsDir(templateDefaultsDir());
    const view = await getTemplates();
    expect(view.en["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.en["email.subject"],
    );
  });

  it("throws when a language file is not an object", async () => {
    fs.writeFileSync(
      path.join(templateDefaultsDir(), "en.json"),
      JSON.stringify(["nope"]),
    );
    setTemplateDefaultsDir(templateDefaultsDir());
    await expect(getTemplates()).rejects.toThrow(
      /Template defaults for en are not an object/,
    );
  });
  });
});
