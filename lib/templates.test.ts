import { describe, expect, it, vi } from "vitest";
import { DATE_PLACEHOLDERS } from "@/lib/event-date";
import { GENDER_CODES } from "@/lib/gender";
import { LANGUAGE_CODES } from "@/lib/language";
import {
  COUNT_SELECT_PLACEHOLDERS,
  GENDER_SELECT_PLACEHOLDERS,
  TEMPLATE_DEFAULTS,
  TEMPLATE_FIELDS,
  TEMPLATE_GROUPS,
  TEMPLATE_IDS,
  TEMPLATE_ITEMS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_PLACEHOLDERS,
  TEMPLATE_PLACEHOLDER_LABELS,
  applyTemplatesPatch,
  emptyTemplatesView,
  allowedPlaceholdersFor,
  isWishlistNoticeTemplateId,
  missingBudgetSentenceReason,
  missingInvitationTemplateReason,
  templatePlaceholderLabel,
  insertTemplatePlaceholder,
  interpolate,
  parseTemplatePlaceholders,
  placeholderErrorMessage,
  renderTemplate,
  resolveTemplateLanguage,
  revealCopy,
  suggestSelectBranchKeys,
  suggestTemplatePlaceholders,
  invalidPlaceholderRequestError,
  invalidTemplateCount,
  invalidTemplatesHeading,
  invalidTemplatesReason,
  invalidTemplatesSaveReason,
  templateErrorCounts,
  templateErrorLine,
  templateErrorTotal,
  templateErrorPath,
  templatePatchErrors,
  templatePlaceholderAt,
  templatePlaceholderErrors,
  templatesViewErrors,
  templatesViewFromRows,
  templatesViewWithDefaults,
  type TemplatePlaceholderErrorReason,
} from "@/lib/templates";
import * as parseMod from "@/lib/templates/parse";
import {
  EVENT_NAME_PLACEHOLDERS,
  GIVER_NAME_PLACEHOLDERS,
  RECEIVER_NAME_PLACEHOLDERS,
  nameCases,
  nameVars,
} from "@/lib/name-cases";

describe("resolveTemplateLanguage", () => {
  it("uses the guest language when templates exist for it", () => {
    for (const code of LANGUAGE_CODES) {
      expect(resolveTemplateLanguage(code)).toBe(code);
    }
  });

  it("falls back to English when there is no template for the language", () => {
    expect(resolveTemplateLanguage("fr")).toBe("en");
    expect(resolveTemplateLanguage(null)).toBe("en");
    expect(resolveTemplateLanguage("")).toBe("en");
  });
});

describe("missingInvitationTemplateReason", () => {
  const templates = emptyTemplatesView();

  it("accepts a complete pack and an empty guest list", () => {
    expect(
      missingInvitationTemplateReason(
        "email",
        [{ name: "Ada", language: "en" }],
        templates,
      ),
    ).toBeNull();
    expect(missingInvitationTemplateReason("signal", [], templates)).toBeNull();
  });

  it("names guests whose language has no template pack", () => {
    expect(
      missingInvitationTemplateReason(
        "email",
        [
          { name: "Ada", language: "yy" },
          { name: "Ada", language: "xx" },
          { name: "Bea", language: " " },
        ],
        templates,
      ),
    ).toBe(
      "Cannot send email invitations because the following guests have no email templates in their language: Ada (xx), Ada (yy), Bea (unknown).",
    );
    expect(
      missingInvitationTemplateReason(
        "signal",
        [{ name: "Ada", language: "xx" }],
        templates,
      ),
    ).toBe(
      "Cannot send Signal invitations because the following guests have no Signal templates in their language: Ada (xx).",
    );
  });

  it("names the language and the blank required fields", () => {
    const blank = emptyTemplatesView();
    blank.en["email.subject"] = "  ";
    blank.pl["email.body"] = "";
    blank.pl["email.button"] = "";
    blank.pl["signal.body"] = " ";
    expect(
      missingInvitationTemplateReason(
        "email",
        [
          { name: "Ada", language: "en" },
          { name: "Bea", language: "pl" },
        ],
        blank,
      ),
    ).toBe(
      "Cannot send email invitations because the English email template is missing Subject, and the Polish email template is missing Body, Button.",
    );
    expect(
      missingInvitationTemplateReason(
        "signal",
        [{ name: "Bea", language: "pl" }],
        blank,
      ),
    ).toBe(
      "Cannot send Signal invitations because the Polish Signal template is missing Message.",
    );
  });

  it("reports an unknown language and a blank field together", () => {
    const blank = emptyTemplatesView();
    blank.pl["email.subject"] = "";
    expect(
      missingInvitationTemplateReason(
        "email",
        [
          { name: "Ada", language: "xx" },
          { name: "Bea", language: "pl" },
        ],
        blank,
      ),
    ).toBe(
      "Cannot send email invitations because the following guests have no email templates in their language: Ada (xx). Cannot send email invitations because the Polish email template is missing Subject.",
    );
  });
});

describe("missingBudgetSentenceReason", () => {
  it("returns null when there are no guests or the sentences are filled", () => {
    expect(
      missingBudgetSentenceReason("zero", [], TEMPLATE_DEFAULTS),
    ).toBeNull();
    expect(
      missingBudgetSentenceReason(
        "amount",
        [{ name: "Ada", language: "en" }],
        TEMPLATE_DEFAULTS,
      ),
    ).toBeNull();
  });

  it("names a blank reveal sentence and joins several languages", () => {
    const templates = emptyTemplatesView();
    templates.en["reveal.budget_zero"] = " ";
    templates.pl["email.budget_zero"] = "";
    templates.pl["reveal.budget_zero"] = "";
    expect(
      missingBudgetSentenceReason(
        "zero",
        [
          { name: "Ada", language: "en" },
          { name: "Bea", language: "pl" },
        ],
        templates,
      ),
    ).toBe(
      "Cannot send invitations because the English budget text is missing reveal page Make-the-gift line, and the Polish budget text is missing email Make-the-gift line and reveal page Make-the-gift line.",
    );
  });
});

describe("TEMPLATE_DEFAULTS", () => {
  it("covers every guest language with every field", () => {
    expect(TEMPLATE_LANGUAGES).toEqual(["en", "pl", "de", "es", "ja"]);
    expect([...TEMPLATE_LANGUAGES].sort()).toEqual([...LANGUAGE_CODES].sort());
    for (const lang of TEMPLATE_LANGUAGES) {
      expect(Object.keys(TEMPLATE_DEFAULTS[lang]).sort()).toEqual(
        [...TEMPLATE_IDS].sort(),
      );
      expect(TEMPLATE_DEFAULTS[lang]["email.body"]).toContain("{button}");
      expect(TEMPLATE_DEFAULTS[lang]["email.body"]).toContain("{budget_line}");
      expect(TEMPLATE_DEFAULTS[lang]["email.body"]).toContain("{guest_count");
      expect(TEMPLATE_DEFAULTS[lang]["signal.body"]).toContain("\n\n{url}\n\n");
      expect(TEMPLATE_DEFAULTS[lang]["signal.body"]).toContain("{budget_line}");
      expect(TEMPLATE_DEFAULTS[lang]["signal.body"]).toContain("{guest_count");
      expect(TEMPLATE_DEFAULTS[lang]["reveal.greeting"]).not.toContain("{date}");
      expect(TEMPLATE_DEFAULTS[lang]["push.opened.body"]).not.toContain(
        "{date}",
      );
      expect(TEMPLATE_DEFAULTS[lang]["reveal.previous_row"]).toContain("{year}");
    }
  });
});

describe("interpolate", () => {
  it("replaces provided placeholders", () => {
    expect(
      interpolate("Hi {giver}! Link: {url}", {
        giver: "Ada",
        url: "https://santa.test/abc",
      }),
    ).toBe("Hi Ada! Link: https://santa.test/abc");
  });

  it("replaces gender placeholders", () => {
    expect(
      interpolate("{giver} ({giver_gender})", {
        giver: "Ada",
        giver_gender: "female",
      }),
    ).toBe("Ada (female)");
  });

  it("leaves omitted placeholders intact", () => {
    expect(interpolate("Gift for {receiver}", {})).toBe("Gift for {receiver}");
  });

  it("replaces a provided key with empty string", () => {
    expect(interpolate("x{budget_line}y", { budget_line: "" })).toBe("xy");
  });

  it("treats an explicit undefined var as empty", () => {
    expect(interpolate("{giver}", { giver: undefined })).toBe("");
    expect(
      interpolate("{giver_gender|female:X|male:Y}", {
        giver_gender: undefined,
      }),
    ).toBe("");
  });

  it("leaves unknown tokens intact", () => {
    expect(interpolate("Hello {foo}", { giver: "Ada" })).toBe("Hello {foo}");
  });

  it("selects greeting by giver gender", () => {
    const tpl = "{giver_gender|female:Droga|male:Drogi} {giver_wolacz}";
    expect(
      interpolate(
        tpl,
        nameVars("giver", nameCases("Anna", { gender: "female", nameWolacz: "Anno" })),
      ),
    ).toBe("Droga Anno");
    expect(
      interpolate(
        tpl,
        nameVars(
          "giver",
          nameCases("Dominik", { gender: "male", nameWolacz: "Dominiku" }),
        ),
      ),
    ).toBe("Drogi Dominiku");
  });

  it("leaves a gender select intact when the var is omitted", () => {
    expect(
      interpolate("{receiver_gender|female:jej|male:jego} lista", {
        giver: "Ada",
      }),
    ).toBe("{receiver_gender|female:jej|male:jego} lista");
  });

  it("leaves a gender fallback select intact and blanks a missing branch", () => {
    expect(
      interpolate("{giver_gender|female:Droga|Cześć}", {
        giver_gender: "male",
      }),
    ).toBe("{giver_gender|female:Droga|Cześć}");
    expect(
      interpolate("{giver_gender|female:Droga}", { giver_gender: "male" }),
    ).toBe("");
  });

  it("keeps colons inside a branch value", () => {
    expect(
      interpolate("{giver_gender|female:Godz. 18:00|male:x}", {
        giver_gender: "female",
      }),
    ).toBe("Godz. 18:00");
  });

  it("leaves an invalid select literal", () => {
    expect(
      interpolate("{giver_gender|fmale:Droga|male:Drogi}", {
        giver_gender: "female",
      }),
    ).toBe("{giver_gender|fmale:Droga|male:Drogi}");
  });

  it("selects by receiver gender", () => {
    expect(
      interpolate("lista {receiver_gender|female:jej|male:jego}", {
        receiver_gender: "female",
      }),
    ).toBe("lista jej");
    expect(
      interpolate("lista {receiver_gender|female:jej|male:jego}", {
        receiver_gender: "male",
      }),
    ).toBe("lista jego");
  });

  it("blanks a valid gender select when gender is empty", () => {
    expect(
      interpolate("{giver_gender|female:Droga|male:Drogi}", {
        giver_gender: "",
      }),
    ).toBe("");
  });

  it("does not interpolate a gender select with a fallback or trailing pipe", () => {
    expect(
      interpolate("{giver_gender|female:Droga|male:Drogi|Cześć}", {
        giver_gender: "female",
      }),
    ).toBe("{giver_gender|female:Droga|male:Drogi|Cześć}");
    expect(
      interpolate("{giver_gender|female:Droga|male:Drogi|}", {
        giver_gender: "female",
      }),
    ).toBe("{giver_gender|female:Droga|male:Drogi|}");
  });

  it("preserves spaces and empty branch values", () => {
    expect(
      interpolate("{giver_gender|female: Droga |male:x}", {
        giver_gender: "female",
      }),
    ).toBe(" Droga ");
    expect(
      interpolate("{giver_gender|female:|male:Drogi}", {
        giver_gender: "female",
      }),
    ).toBe("");
  });

  it("accepts male-first order and trimmed keys", () => {
    expect(
      interpolate("{giver_gender| male :Drogi| female :Droga}", {
        giver_gender: "female",
      }),
    ).toBe("Droga");
  });

  it("leaves unclosed and non-gender selects literal", () => {
    expect(
      interpolate("{giver_gender|female:Droga", { giver_gender: "female" }),
    ).toBe("{giver_gender|female:Droga");
    expect(interpolate("{event|female:Office}", { event: "Office" })).toBe(
      "{event|female:Office}",
    );
  });

  it("returns copy with no placeholders unchanged", () => {
    expect(interpolate("Just text.", { giver: "Ada" })).toBe("Just text.");
  });

  it("replaces guest_count with the digits", () => {
    expect(interpolate("{guest_count} people", { guest_count: "13" })).toBe(
      "13 people",
    );
  });

  it("selects Polish 1, 2, and fallback branches and substitutes #", () => {
    const tpl =
      "W losowaniu {guest_count|1:wzięła udział # osoba|2:wzięły udział # osoby|wzięło udział # osób}.";
    expect(interpolate(tpl, { guest_count: "1" }, "pl")).toBe(
      "W losowaniu wzięła udział 1 osoba.",
    );
    expect(interpolate(tpl, { guest_count: "22" }, "pl")).toBe(
      "W losowaniu wzięły udział 22 osoby.",
    );
    expect(interpolate(tpl, { guest_count: "13" }, "pl")).toBe(
      "W losowaniu wzięło udział 13 osób.",
    );
    expect(interpolate(tpl, { guest_count: "21" }, "pl")).toBe(
      "W losowaniu wzięło udział 21 osób.",
    );
  });

  it("uses English fallback for 22 even when a 2 branch exists", () => {
    expect(
      interpolate(
        "{guest_count|1:# person|2:# few|# people}",
        { guest_count: "22" },
        "en",
      ),
    ).toBe("22 people");
    expect(
      interpolate(
        "{guest_count|1:# person|# people}",
        { guest_count: "1" },
        "en",
      ),
    ).toBe("1 person");
  });

  it("leaves an omitted guest_count select intact", () => {
    const tpl = "{guest_count|1:# person|# people}";
    expect(interpolate(tpl, { giver: "Ada" }, "en")).toBe(tpl);
    expect(
      interpolate(tpl, { guest_count: undefined }, "en"),
    ).toBe("# people");
  });

  it("leaves an invalid count branch literal", () => {
    expect(
      interpolate("{guest_count|3:# x|# people}", { guest_count: "13" }, "en"),
    ).toBe("{guest_count|3:# x|# people}");
  });

  it("uses the select fallback when guest_count is not a number", () => {
    expect(
      interpolate("{guest_count|1:# person|# people}", { guest_count: "n" }, "en"),
    ).toBe("# people");
    expect(
      interpolate("{guest_count|1:# person}", { guest_count: "n" }, "en"),
    ).toBe("");
    expect(
      interpolate("{guest_count|1:# person}", { guest_count: "13" }, "en"),
    ).toBe("");
  });

  it("uses an empty gender select when the chosen branch is blank", () => {
    expect(
      interpolate("{giver_gender|female:}", { giver_gender: "female" }),
    ).toBe("");
    expect(
      interpolate("{giver_gender|female:F}", { giver_gender: "male" }),
    ).toBe("");
  });

  it("uses an empty count branch when the chosen value is blank", () => {
    expect(interpolate("{guest_count|1:}", { guest_count: "1" }, "en")).toBe(
      "",
    );
  });
});

describe("templatePlaceholderLabel", () => {
  it("labels known placeholders and echoes unknown names", () => {
    expect(templatePlaceholderLabel("url")).toBe("Private guest link");
    expect(TEMPLATE_PLACEHOLDER_LABELS.url).toBe("Private guest link");
    expect(templatePlaceholderLabel("date")).toBe(
      "Party date (e.g. 2 August 2027)",
    );
    expect(templatePlaceholderLabel("date_month_miejscownik")).toContain(
      "locative",
    );
    expect(TEMPLATE_PLACEHOLDER_LABELS.date_day_pad).toBe("Day, two digits");
    expect(templatePlaceholderLabel("mystery")).toBe("mystery");
    expect(templatePlaceholderLabel("event_wolacz")).toContain("Event");
    expect(templatePlaceholderLabel("giver_gender")).toContain("gender");
    expect(templatePlaceholderLabel("giver_nickname")).toBe("Guest nickname");
    expect(templatePlaceholderLabel("year")).toBe("Past edition year");
    expect(TEMPLATE_PLACEHOLDER_LABELS.year).toBe("Past edition year");
  });
});

describe("templatesViewFromRows", () => {
  it("starts from defaults and applies overrides", () => {
    const view = templatesViewFromRows([
      {
        templateId: "email.subject",
        language: "pl",
        value: "Custom {event}",
      },
    ]);
    expect(view.pl["email.subject"]).toBe("Custom {event}");
    expect(view.en["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.en["email.subject"],
    );
    expect(view.pl["email.body"]).toBe(TEMPLATE_DEFAULTS.pl["email.body"]);
  });

  it("ignores unknown languages and ids", () => {
    const view = templatesViewFromRows([
      { templateId: "email.subject", language: "xx", value: "Nope" },
      { templateId: "email.unknown", language: "en", value: "Nope" },
    ]);
    expect(view.en["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.en["email.subject"],
    );
  });
});

describe("applyTemplatesPatch", () => {
  it("keeps leading spaces and stores blanks as empty strings", () => {
    const view = applyTemplatesPatch(emptyTemplatesView(), {
      en: {
        "email.budget_line": " The budget is {budget}.",
        "email.subject": "  ",
        "email.body": undefined,
      },
    });
    expect(view.en["email.budget_line"]).toBe(" The budget is {budget}.");
    expect(view.en["email.subject"]).toBe("  ");
    expect(view.en["email.body"]).toBe("");
  });
});

describe("renderTemplate", () => {
  it("uses English defaults for an English guest", () => {
    const view = emptyTemplatesView();
    expect(
      renderTemplate(view, "email.subject", "en", { event: "Office" }),
    ).toBe("🎁 Office: Find out who you're preparing a present for!");
  });

  it("uses each guest language's own defaults", () => {
    const view = emptyTemplatesView();
    expect(
      renderTemplate(view, "email.subject", "de", { event: "Office" }),
    ).toBe("🎁 Office: Wen beschenkst du dieses Jahr?");
    expect(
      renderTemplate(view, "email.subject", "es", { event: "Office" }),
    ).toBe("🎁 Office: ¿Quién te ha tocado este año?");
    expect(
      renderTemplate(view, "email.subject", "ja", { event: "Office" }),
    ).toBe("🎁 Office：今年は誰に贈る？");
  });

  it("falls back to English for an unknown language", () => {
    const view = emptyTemplatesView();
    expect(
      renderTemplate(view, "email.subject", "fr", { event: "Office" }),
    ).toBe("🎁 Office: Find out who you're preparing a present for!");
  });

  it("interpolates a gender select in a stored email body", () => {
    const view = applyTemplatesPatch(emptyTemplatesView(), {
      en: {
        "email.body": "{giver_gender|female:Hi|male:Hey} {giver}",
      },
    });
    expect(
      renderTemplate(view, "email.body", "en", {
        giver_gender: "female",
        giver: "Ada",
      }),
    ).toBe("Hi Ada");
  });

  it("interpolates the default Polish count sentence", () => {
    const view = emptyTemplatesView();
    expect(
      renderTemplate(view, "email.body", "pl", {
        giver: "Ada",
        event: "Biuro",
        guest_count: "22",
        budget_line: "",
        button: "OK",
      }),
    ).toContain("Łącznie w losowaniu biorą udział 22 osoby.");
    expect(
      renderTemplate(view, "email.body", "pl", {
        giver: "Ada",
        event: "Biuro",
        guest_count: "13",
        budget_line: "",
        button: "OK",
      }),
    ).toContain("Łącznie w losowaniu bierze udział 13 osób.");
    expect(
      renderTemplate(view, "email.body", "pl", {
        guest_count: "1",
        budget_line: "",
        button: "OK",
      }),
    ).toContain("Łącznie w losowaniu bierze udział 1 osoba.");
    expect(
      renderTemplate(view, "email.body", "pl", {
        guest_count: "21",
        budget_line: "",
        button: "OK",
      }),
    ).toContain("Łącznie w losowaniu bierze udział 21 osób.");
  });

  it("offers {location} and {location_gdzie} on invitation copy only", () => {
    for (const id of ["email.subject", "email.body", "signal.body"] as const) {
      expect(
        TEMPLATE_FIELDS.find((f) => f.id === id)?.placeholders,
      ).toEqual(expect.arrayContaining(["location", "location_gdzie"]));
    }
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "push.opened.body")?.placeholders,
    ).not.toContain("location");
    expect(templatePlaceholderLabel("location")).toBe("Place name (Katowice)");
    expect(templatePlaceholderLabel("location_gdzie")).toBe(
      "Place, Polish gdzie? phrase (w Katowicach)",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.body"]).toContain(
      "spędzimy Święta wszyscy razem {location_gdzie}",
    );
  });
});

describe("gender placeholders", () => {
  it("allows select only on giver and receiver gender", () => {
    expect(GENDER_SELECT_PLACEHOLDERS).toEqual([
      "giver_gender",
      "receiver_gender",
    ]);
  });

  it("allows count select on guest_count", () => {
    expect(COUNT_SELECT_PLACEHOLDERS).toEqual(["guest_count"]);
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "email.body")?.placeholders,
    ).toContain("guest_count");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "signal.body")?.placeholders,
    ).toContain("guest_count");
  });

  it("lists giver and receiver gender on the fields that compose people", () => {
    expect(GIVER_NAME_PLACEHOLDERS).toContain("giver_gender");
    expect(RECEIVER_NAME_PLACEHOLDERS).toContain("receiver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "email.body")?.placeholders,
    ).toContain("giver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "email.body")?.placeholders,
    ).toContain("button");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "push.opened.body")?.placeholders,
    ).toContain("giver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.revealed_title")
        ?.placeholders,
    ).toContain("receiver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.revealed_name")
        ?.placeholders,
    ).toContain("receiver_biernik");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.wishlist_empty")
        ?.placeholders,
    ).toContain("receiver");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.wishlist_heading")
        ?.placeholders,
    ).toContain("receiver");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.ready_description")
        ?.placeholders,
    ).toContain("giver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.own_wishlist_description")
        ?.placeholders,
    ).toContain("giver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.previous_description")
        ?.placeholders,
    ).toContain("giver_gender");
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "reveal.previous_row")?.placeholders,
    ).toEqual(["year", ...RECEIVER_NAME_PLACEHOLDERS]);
  });
});

describe("email button template", () => {
  it("defaults a button label and places {button} in the body", () => {
    expect(TEMPLATE_DEFAULTS.en["email.button"]).toBe(
      "See who you're gifting!",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.button"]).toBe(
      "Zobacz, kogo obdarujesz",
    );
    for (const lang of TEMPLATE_LANGUAGES) {
      expect(TEMPLATE_DEFAULTS[lang]["email.body"]).toContain("{button}");
    }
    expect(
      TEMPLATE_FIELDS.find((f) => f.id === "email.button")?.item,
    ).toBe("email.button");
  });
});

describe("template items", () => {
  it("covers every field with an item in a known group", () => {
    const groups = new Set<string>(TEMPLATE_GROUPS.map((g) => g.id));
    const items = new Map<string, string>(
      TEMPLATE_ITEMS.map((item) => [item.id, item.group]),
    );
    expect(items.size).toBe(TEMPLATE_ITEMS.length);
    for (const item of TEMPLATE_ITEMS) {
      expect(groups.has(item.group)).toBe(true);
      expect(TEMPLATE_FIELDS.some((f) => f.item === item.id)).toBe(true);
    }
    for (const field of TEMPLATE_FIELDS) {
      expect(items.has(field.item)).toBe(true);
    }
  });

  it("pairs push titles and bodies under one item", () => {
    expect(
      TEMPLATE_FIELDS.filter((f) => f.item === "push.opened").map((f) => f.id),
    ).toEqual(["push.opened.title", "push.opened.body"]);
    expect(
      TEMPLATE_FIELDS.filter((f) => f.item === "reveal.revealed_title").map(
        (f) => f.id,
      ),
    ).toEqual(["reveal.revealed_title", "reveal.revealed_name"]);
    expect(
      TEMPLATE_FIELDS.filter((f) => f.item === "reveal.previous_years").map(
        (f) => f.id,
      ),
    ).toEqual([
      "reveal.previous_title",
      "reveal.previous_description",
      "reveal.previous_row",
    ]);
  });
});

describe("giver wishlist-notice templates", () => {
  const noticeIds = TEMPLATE_IDS.filter((id) =>
    isWishlistNoticeTemplateId(id),
  );

  it("covers added, removed, and changed for email and Signal", () => {
    expect(noticeIds).toEqual([
      "email.wishlist_added.subject",
      "email.wishlist_added.body",
      "email.wishlist_removed.subject",
      "email.wishlist_removed.body",
      "email.wishlist_changed.subject",
      "email.wishlist_changed.body",
      "email.wishlist_button",
      "signal.wishlist_added.body",
      "signal.wishlist_removed.body",
      "signal.wishlist_changed.body",
    ]);
    expect(TEMPLATE_DEFAULTS.en["email.wishlist_button"]).toBe(
      "See the wishlist",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_button"]).toBe(
      "Zobacz listę życzeń",
    );
    expect(TEMPLATE_DEFAULTS.de["email.wishlist_button"]).toBe(
      "Wunschzettel ansehen",
    );
    expect(TEMPLATE_DEFAULTS.ja["email.wishlist_button"]).toBe(
      "ほしいものリストを見る",
    );
    expect(TEMPLATE_DEFAULTS.en["email.wishlist_added.subject"]).toBe(
      "🎁 {event}: Something new on the wishlist",
    );
    expect(TEMPLATE_DEFAULTS.en["email.wishlist_removed.subject"]).toBe(
      "🎁 {event}: Something was removed from the wishlist",
    );
    expect(TEMPLATE_DEFAULTS.en["email.wishlist_changed.subject"]).toBe(
      "🎁 {event}: Something changed on the wishlist",
    );
    expect(TEMPLATE_DEFAULTS.en["email.wishlist_added.body"]).toContain(
      "preparing a present for has added something to their wishlist",
    );
    expect(TEMPLATE_DEFAULTS.en["email.wishlist_added.body"]).toContain(
      "Click the button below to see the updated list.",
    );
    expect(TEMPLATE_DEFAULTS.en["email.body"]).toContain(
      "PS If the button doesn't work, open this link: {url}",
    );
    expect(TEMPLATE_DEFAULTS.en["email.body"]).not.toContain("P.S.");
    expect(TEMPLATE_DEFAULTS.en["signal.wishlist_added.body"]).toContain(
      "Open the link below to see the updated list.",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_added.body"]).toContain(
      "osoba, dla której przygotowujesz prezent, dopisała coś do swojej listy życzeń.",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_removed.body"]).toContain(
      "wykreśliła coś ze swojej listy życzeń.",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_changed.body"]).toContain(
      "zmieniła coś na swojej liście życzeń.",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_added.body"]).toContain(
      "Kliknij poniższy przycisk, aby zobaczyć aktualną listę.",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_added.body"]).toContain(
      "PS Jeżeli przycisk nie działa, otwórz ten link: {url}",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.wishlist_added.body"]).not.toContain(
      "PS.",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.body"]).toContain(
      "PS Jeżeli przycisk nie działa, otwórz ten link: {url}",
    );
    expect(TEMPLATE_DEFAULTS.pl["email.body"]).not.toContain("PS.");
    expect(TEMPLATE_DEFAULTS.pl["signal.wishlist_added.body"]).toContain(
      "Otwórz poniższy link, żeby zobaczyć aktualną listę.",
    );
    expect(TEMPLATE_DEFAULTS.de["signal.wishlist_added.body"]).toContain(
      "{url}",
    );
    expect(TEMPLATE_DEFAULTS.de["email.wishlist_added.body"]).toContain(
      "die Person, für die du ein Geschenk vorbereitest, hat etwas Neues auf ihren Wunschzettel geschrieben.",
    );
    expect(TEMPLATE_DEFAULTS.de["email.wishlist_removed.body"]).toContain(
      "hat etwas von ihrem Wunschzettel gestrichen.",
    );
    expect(TEMPLATE_DEFAULTS.de["email.wishlist_changed.body"]).toContain(
      "hat etwas auf ihrem Wunschzettel geändert.",
    );
    expect(TEMPLATE_DEFAULTS.de["email.wishlist_added.body"]).toContain(
      "Drücke unten auf den Knopf, um die aktuelle Liste zu sehen.",
    );
    expect(TEMPLATE_DEFAULTS.de["signal.wishlist_changed.body"]).toContain(
      "Öffne den Link unten, um die aktuelle Liste zu sehen.",
    );
    expect(TEMPLATE_DEFAULTS.es["email.wishlist_removed.subject"]).toContain(
      "Han quitado algo de la lista de deseos",
    );
    expect(TEMPLATE_DEFAULTS.es["email.wishlist_added.body"]).toContain(
      "La persona a la que le preparas el regalo ha añadido algo nuevo a su lista de deseos.",
    );
    expect(TEMPLATE_DEFAULTS.es["email.wishlist_added.body"]).toContain(
      "Pulsa el botón de abajo para ver la lista actualizada.",
    );
    expect(TEMPLATE_DEFAULTS.es["signal.wishlist_removed.body"]).toContain(
      "Abre el enlace de abajo para ver la lista actualizada.",
    );
    expect(TEMPLATE_DEFAULTS.ja["email.wishlist_changed.body"]).toContain(
      "{button}",
    );
    expect(TEMPLATE_DEFAULTS.ja["email.wishlist_added.subject"]).toContain(
      "ほしいものリストに新しいものが追加されたよ",
    );
    expect(TEMPLATE_DEFAULTS.ja["email.wishlist_added.body"]).toContain(
      "{giver}さん、こんにちは！",
    );
    expect(TEMPLATE_DEFAULTS.ja["email.wishlist_added.body"]).toContain(
      "プレゼントを贈る相手が「ほしいものリスト」に新しいものを書き足したよ。",
    );
    expect(TEMPLATE_DEFAULTS.ja["email.wishlist_added.body"]).toContain(
      "下のボタンを押して、新しいリストを見てみてね。",
    );
    expect(TEMPLATE_DEFAULTS.ja["signal.wishlist_added.body"]).toContain(
      "下のリンクを開いて、新しいリストを見てみてね。",
    );
    for (const lang of TEMPLATE_LANGUAGES) {
      expect(TEMPLATE_DEFAULTS[lang]["email.wishlist_added.body"]).not.toMatch(
        /\|Cześć|\|Hallo|\|Hola/,
      );
      expect(TEMPLATE_DEFAULTS[lang]["reveal.wishlist_empty"]).not.toContain(
        "|wpisał(a)",
      );
    }
  });

  it("does not use a fallback on gender selects", () => {
    for (const lang of TEMPLATE_LANGUAGES) {
      for (const id of TEMPLATE_IDS) {
        for (const span of parseTemplatePlaceholders(
          TEMPLATE_DEFAULTS[lang][id],
        )) {
          if (!span.select || !GENDER_SELECT_PLACEHOLDERS.includes(
            span.name as (typeof GENDER_SELECT_PLACEHOLDERS)[number],
          )) {
            continue;
          }
          expect(span.fallback, `${lang} ${id}`).toBeUndefined();
          expect(span.known, `${lang} ${id}`).toBe(true);
        }
      }
    }
  });

  it("never names the receiver or quotes a wish", () => {
    for (const id of noticeIds) {
      for (const lang of TEMPLATE_LANGUAGES) {
        expect(TEMPLATE_DEFAULTS[lang][id]).not.toMatch(/\{receiver/);
        expect(TEMPLATE_DEFAULTS[lang][id]).not.toMatch(
          /\{(text|item|wish)\}/,
        );
      }
      const field = TEMPLATE_FIELDS.find((item) => item.id === id)!;
      expect(field.placeholders).not.toEqual(
        expect.arrayContaining(
          RECEIVER_NAME_PLACEHOLDERS as unknown as string[],
        ),
      );
    }
  });

  it("rejects a receiver token on save", () => {
    const view = emptyTemplatesView();
    view.en["email.wishlist_added.body"] =
      "Hi {giver}, you drew {receiver}.";
    expect(templatesViewErrors(view)).toMatchObject([
      {
        language: "en",
        id: "email.wishlist_added.body",
        token: "{receiver}",
        reason: "not_allowed",
        message: "{receiver} cannot be used in this template.",
      },
    ]);
  });

  it("does not double-count a broken token on a notice field", () => {
    const view = emptyTemplatesView();
    view.en["email.wishlist_added.body"] = "Hi {nope}";
    const errors = templatesViewErrors(view).filter(
      (error) => error.id === "email.wishlist_added.body",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toBe("unknown");
  });

  it("restricts placeholders on notice fields only", () => {
    expect(allowedPlaceholdersFor("email.body")).toBeNull();
    expect(allowedPlaceholdersFor("email.wishlist_added.body")).toEqual([
      ...GIVER_NAME_PLACEHOLDERS,
      "url",
      "button",
    ]);
    expect(allowedPlaceholdersFor("email.wishlist_button")).toEqual([]);
    expect(isWishlistNoticeTemplateId("push.wishlist_added.body")).toBe(false);
  });

  it("does not require notice fields before an invitation send", () => {
    const view = emptyTemplatesView();
    view.en["email.wishlist_added.body"] = "";
    view.en["signal.wishlist_added.body"] = "";
    expect(
      missingInvitationTemplateReason(
        "email",
        [{ name: "Ada", language: "en" }],
        view,
      ),
    ).toBeNull();
    expect(
      missingInvitationTemplateReason(
        "signal",
        [{ name: "Ada", language: "en" }],
        view,
      ),
    ).toBeNull();
  });
});

describe("push wishlist templates", () => {
  it("only interpolate giver and event, never item text", () => {
    for (const id of [
      "push.wishlist_added.body",
      "push.wishlist_read.body",
    ] as const) {
      for (const lang of TEMPLATE_LANGUAGES) {
        expect(TEMPLATE_DEFAULTS[lang][id]).not.toMatch(
          /\{(text|url|item|receiver)\}/,
        );
      }
    }
    expect(TEMPLATE_DEFAULTS.en["push.wishlist_added.body"]).toBe(
      "{giver} added something to their wishlist.",
    );
    expect(TEMPLATE_DEFAULTS.pl["push.wishlist_read.body"]).toBe(
      "{giver} {giver_gender|female:zajrzała|male:zajrzał} do zaktualizowanej listy życzeń.",
    );
    expect(
      TEMPLATE_FIELDS.filter((f) => f.id.startsWith("push.wishlist_")).map(
        (f) => f.placeholders,
      ),
    ).toEqual([
      [...EVENT_NAME_PLACEHOLDERS, ...DATE_PLACEHOLDERS],
      [
        ...GIVER_NAME_PLACEHOLDERS,
        ...EVENT_NAME_PLACEHOLDERS,
        ...DATE_PLACEHOLDERS,
      ],
      [...EVENT_NAME_PLACEHOLDERS, ...DATE_PLACEHOLDERS],
      [
        ...GIVER_NAME_PLACEHOLDERS,
        ...EVENT_NAME_PLACEHOLDERS,
        ...DATE_PLACEHOLDERS,
      ],
    ]);
  });

  it("inflects Polish Signal and push bodies by giver gender", () => {
    const view = TEMPLATE_DEFAULTS;
    const female = nameVars(
      "giver",
      nameCases("Ada", { gender: "female", nameWolacz: "Ado" }),
    );
    const male = nameVars(
      "giver",
      nameCases("Piotr", { gender: "male", nameWolacz: "Piotrze" }),
    );
    const invitation = {
      url: "https://santa.test/abc",
      budget_line: "",
      guest_count: "2",
      location_gdzie: "w Katowicach",
      date_year: "2026",
    };

    const femaleSignal = renderTemplate(view, "signal.body", "pl", {
      ...female,
      ...invitation,
    });
    expect(femaleSignal).toContain("Cześć, Ado!");
    expect(femaleSignal).toContain("kogo wylosowałaś");
    const maleSignal = renderTemplate(view, "signal.body", "pl", {
      ...male,
      ...invitation,
    });
    expect(maleSignal).toContain("Cześć, Piotrze!");
    expect(maleSignal).toContain("kogo wylosowałeś");

    expect(renderTemplate(view, "push.opened.body", "pl", female)).toBe(
      "Ada otworzyła swój prywatny link.",
    );
    expect(renderTemplate(view, "push.opened.body", "pl", male)).toBe(
      "Piotr otworzył swój prywatny link.",
    );
    expect(renderTemplate(view, "push.revealed.body", "pl", female)).toBe(
      "Ada sprawdziła, kogo wylosowała.",
    );
    expect(renderTemplate(view, "push.revealed.body", "pl", male)).toBe(
      "Piotr sprawdził, kogo wylosował.",
    );
    expect(renderTemplate(view, "push.wishlist_added.body", "pl", female)).toBe(
      "Ada dodała coś do swojej listy życzeń.",
    );
    expect(renderTemplate(view, "push.wishlist_added.body", "pl", male)).toBe(
      "Piotr dodał coś do swojej listy życzeń.",
    );
    expect(renderTemplate(view, "push.wishlist_read.body", "pl", female)).toBe(
      "Ada zajrzała do zaktualizowanej listy życzeń.",
    );
    expect(renderTemplate(view, "push.wishlist_read.body", "pl", male)).toBe(
      "Piotr zajrzał do zaktualizowanej listy życzeń.",
    );
    expect(renderTemplate(view, "push.revealed.body", "de", female)).toBe(
      "Ada hat nachgeschaut, wen sie gezogen hat.",
    );
    expect(renderTemplate(view, "push.revealed.body", "de", male)).toBe(
      "Piotr hat nachgeschaut, wen er gezogen hat.",
    );
  });
});

describe("revealCopy", () => {
  it("interpolates greeting without touching receiver placeholders", () => {
    const view = emptyTemplatesView();
    const copy = revealCopy(view, "en", { giver: "Ada", event: "Office" });
    expect(copy.greeting).toBe("Hi, Ada!");
    expect(copy.revealedTitle).toBe("This year you're gifting");
    expect(copy.revealedName).toBe("{receiver}");
    expect(copy.wishlistHeading).toBe("What {receiver} would like to receive");
    expect(copy.wishlistEmpty).toBe(
      "{receiver} hasn't added any gift ideas yet. Check back later.",
    );
    expect(copy.ownWishlistDescription).toBe(
      "If there's something you're dreaming of, you can leave a small hint here. Only the person who drew you will see it.",
    );
    expect(copy.unwrapError).toBe("Could not open your draw. Please try again.");
    expect(copy.previousTitle).toBe("Previous years");
    expect(copy.previousDescription).toBe(
      "Previously you have prepared presents for",
    );
    expect(copy.previousRow).toBe("{year} — {receiver}");
  });

  it("uses Polish vocative and leaves receiver genitive for the wishlist heading", () => {
    const view = emptyTemplatesView();
    const copy = revealCopy(view, "pl", {
      ...nameVars(
        "giver",
        nameCases("Anna", { gender: "female", nameWolacz: "Anno" }),
      ),
      event: "Biuro",
    });
    expect(copy.greeting).toBe("Cześć, Anno!");
    expect(copy.revealedTitle).toBe("W tym roku obdarujesz");
    expect(copy.revealedName).toBe("{receiver_biernik}");
    expect(copy.budgetLabel).toBe("Limit prezentu to {budget}");
    expect(
      interpolate(
        copy.revealedName,
        nameVars("receiver", nameCases("Bea", { nameBiernik: "Beę" })),
      ),
    ).toBe("Beę");
    expect(copy.wishlistHeading).toBe("Lista życzeń {receiver_dopelniacz}");
    expect(copy.ownWishlistDescription).toBe(
      "Jeżeli jest coś, o czym marzysz, możesz tu zostawić małą wskazówkę. Zobaczy ją tylko osoba, która Cię wylosowała.",
    );
    expect(
      interpolate(copy.wishlistHeading, {
        ...nameVars(
          "receiver",
          nameCases("Bea", { nameDopelniacz: "Bei" }),
        ),
      }),
    ).toBe("Lista życzeń Bei");
    expect(
      interpolate(
        copy.wishlistEmpty,
        nameVars("receiver", nameCases("Bea", { gender: "female" })),
      ),
    ).toBe(
      "Bea nie wpisała jeszcze żadnych pomysłów na prezent. Zajrzyj tu później.",
    );
    expect(copy.previousTitle).toBe("Poprzednie lata");
    expect(copy.previousDescription).toBe(
      "Wcześniej przygotowywałaś prezenty dla",
    );
    expect(copy.previousRow).toBe("{year} — {receiver_dopelniacz}");
    expect(
      interpolate(copy.previousRow, {
        year: "2025",
        ...nameVars(
          "receiver",
          nameCases("Bea", { nameDopelniacz: "Bei" }),
        ),
      }),
    ).toBe("2025 — Bei");
  });

  it("keeps German, Spanish, and Japanese reveal copy short and casual", () => {
    const view = emptyTemplatesView();
    const de = revealCopy(view, "de", { giver: "Ada" });
    expect(de.readyDescription).toBe(
      "Drück unten auf den Knopf, um zu sehen, wen du beschenkst. Diese Seite siehst nur du.",
    );
    expect(de.revealedTitle).toBe("Dieses Jahr beschenkst du…");
    expect(de.budgetLabel).toBe("Limit fürs Geschenk: {budget}");
    expect(TEMPLATE_DEFAULTS.de["reveal.budget_zero"]).toBe(
      "Selbst gemachtes Geschenk — ohne Geld auszugeben.",
    );
    expect(TEMPLATE_DEFAULTS.de["reveal.budget_unlimited"]).toBe(
      "Kein Preislimit.",
    );
    expect(de.wishlistEmpty).toBe(
      "{receiver} hat noch keine Geschenkideen eingetragen. Schau später nochmal vorbei.",
    );
    expect(de.ownWishlistDescription).toBe(
      "Du hast einen Wunsch? Dann hinterlasse hier einen kleinen Tipp! Nur die Person, die dich beim Wichteln gezogen hat, kann ihn sehen.",
    );
    expect(de.unwrapError).toBe(
      "Das hat leider nicht geklappt. Versuch es bitte nochmal.",
    );

    const es = revealCopy(view, "es", { giver: "Ada" });
    expect(es.readyDescription).toBe(
      "Pulsa el botón de abajo para ver a quién le harás un regalo. Esta página solo la ves tú.",
    );
    expect(es.revealedTitle).toBe("Este año te toca regalarle a…");
    expect(es.budgetLabel).toBe("Límite del regalo: {budget}");
    expect(TEMPLATE_DEFAULTS.es["reveal.budget_zero"]).toBe(
      "Regalo hecho a mano, sin gastar dinero.",
    );
    expect(TEMPLATE_DEFAULTS.es["reveal.budget_unlimited"]).toBe(
      "Sin límite de gasto.",
    );
    expect(es.wishlistEmpty).toBe(
      "{receiver} aún no ha dejado ninguna idea de regalo. Vuelve a mirar más tarde.",
    );
    expect(es.ownWishlistDescription).toBe(
      "¿Hay algo que te haría ilusión recibir? Deja aquí una pista. Solo la verá quien tenga que hacerte un regalo.",
    );

    const ja = revealCopy(view, "ja", { giver: "Ada" });
    expect(ja.greeting).toBe("Adaさん、こんにちは！");
    expect(ja.readyDescription).toBe(
      "下のボタンを押すと、誰にプレゼントを贈るか分かるよ。このページを見られるのはあなただけだよ。",
    );
    expect(ja.unwrapping).toBe("開いてるよ…");
    expect(ja.revealedTitle).toBe("今年あなたがプレゼントを贈る相手は…");
    expect(ja.budgetLabel).toBe("予算の目安：{budget}");
    expect(TEMPLATE_DEFAULTS.ja["reveal.budget_zero"]).toBe(
      "お金をかけずに、手作りのプレゼントを用意してね。",
    );
    expect(TEMPLATE_DEFAULTS.ja["reveal.budget_unlimited"]).toBe(
      "予算の上限はないよ。",
    );
    expect(ja.wishlistHeading).toBe("{receiver}のほしいものリスト");
    expect(ja.wishlistEmpty).toBe(
      "{receiver}はまだほしいものを書いていないみたい。またあとでチェックしてみてね！",
    );
    expect(ja.ownWishlistDescription).toBe(
      "なにかほしいものがあれば、ここにちょっとしたヒントを書いておけるよ。あなたを引いた人だけが見られるよ。",
    );
    expect(ja.notFoundTitle).toBe("ページが見つからないよ");
    expect(ja.notFoundDescription).toBe("このリンクは使えないみたい。");
    expect(ja.unwrapError).toBe(
      "うまく開けなかったみたい。もう一度試してみてね。",
    );
    expect(de.previousTitle).toBe("Frühere Jahre");
    expect(de.previousRow).toBe("{year} — {receiver}");
    expect(es.previousTitle).toBe("Años anteriores");
    expect(es.previousRow).toBe("{year} — {receiver}");
    expect(ja.previousTitle).toBe("これまでの年");
    expect(ja.previousRow).toBe("{year}年 — {receiver}");
  });

  it("interpolates a gender select greeting", () => {
    const view = applyTemplatesPatch(emptyTemplatesView(), {
      pl: {
        "reveal.greeting":
          "{giver_gender|female:Droga|male:Drogi} {giver_wolacz}",
      },
    });
    expect(
      revealCopy(
        view,
        "pl",
        nameVars(
          "giver",
          nameCases("Anna", { gender: "female", nameWolacz: "Anno" }),
        ),
      ).greeting,
    ).toBe("Droga Anno");
  });

  it("interpolates gender in a custom revealed title", () => {
    const view = applyTemplatesPatch(emptyTemplatesView(), {
      en: {
        "reveal.revealed_title": "Gift for {receiver} ({receiver_gender})",
      },
    });
    const copy = revealCopy(view, "en");
    expect(
      interpolate(
        copy.revealedTitle,
        nameVars("receiver", nameCases("Bea", { gender: "female" })),
      ),
    ).toBe("Gift for Bea (female)");
  });
});

describe("parseTemplatePlaceholders", () => {
  it("finds known and unknown closed tokens", () => {
    expect(parseTemplatePlaceholders("Hi {giver} and {givre}!")).toMatchObject([
      {
        start: 3,
        end: 10,
        name: "giver",
        closed: true,
        known: true,
        select: false,
      },
      {
        start: 15,
        end: 22,
        name: "givre",
        closed: true,
        known: false,
        select: false,
      },
    ]);
  });

  it("marks an unclosed brace as a span to the end", () => {
    expect(parseTemplatePlaceholders("Hi {giver")).toMatchObject([
      {
        start: 3,
        end: 9,
        name: "giver",
        closed: false,
        known: false,
        select: false,
      },
    ]);
  });

  it("parses a valid count select", () => {
    const text =
      "{guest_count|1:wzięła udział # osoba|2:wzięły udział # osoby|wzięło udział # osób}";
    expect(parseTemplatePlaceholders(text)).toMatchObject([
      {
        name: "guest_count",
        closed: true,
        known: true,
        select: true,
        branches: {
          "1": "wzięła udział # osoba",
          "2": "wzięły udział # osoby",
        },
        fallback: "wzięło udział # osób",
      },
    ]);
  });

  it("parses a valid gender select", () => {
    const text = "{giver_gender|female:Droga|male:Drogi}";
    expect(parseTemplatePlaceholders(text)).toMatchObject([
      {
        start: 0,
        end: text.length,
        name: "giver_gender",
        closed: true,
        known: true,
        select: true,
        branches: { female: "Droga", male: "Drogi" },
      },
    ]);
    expect(parseTemplatePlaceholders(text)[0]?.fallback).toBeUndefined();
  });

  it("exposes highlight parts for a valid select", () => {
    const text = "{giver_gender|female:Droga|male:Drogi}";
    const span = parseTemplatePlaceholders(text)[0]!;
    expect(
      span.parts.map((p) => ({
        kind: p.kind,
        ok: p.ok,
        slice: text.slice(p.start, p.end),
      })),
    ).toEqual([
      { kind: "name", ok: true, slice: "giver_gender" },
      { kind: "pipe", ok: true, slice: "|" },
      { kind: "branch_key", ok: true, slice: "female" },
      { kind: "text", ok: true, slice: "Droga" },
      { kind: "pipe", ok: true, slice: "|" },
      { kind: "branch_key", ok: true, slice: "male" },
      { kind: "text", ok: true, slice: "Drogi" },
    ]);
  });

  it("marks only the bad gender key as not ok", () => {
    const text = "{giver_gender|fmale:Droga|male:Drogi}";
    const span = parseTemplatePlaceholders(text)[0]!;
    expect(span.known).toBe(false);
    expect(span.select).toBe(true);
    expect(
      span.parts
        .filter((p) => p.kind === "branch_key")
        .map((p) => ({
          ok: p.ok,
          reason: p.reason,
          slice: text.slice(p.start, p.end),
        })),
    ).toEqual([
      { ok: false, reason: "unknown_branch", slice: "fmale" },
      { ok: true, reason: undefined, slice: "male" },
    ]);
  });

  it("rejects a trailing gender fallback and still parses a receiver select", () => {
    expect(
      parseTemplatePlaceholders("{giver_gender|female:Droga|}"),
    ).toMatchObject([
      {
        known: false,
        branches: { female: "Droga" },
      },
    ]);
    expect(
      parseTemplatePlaceholders("{giver_gender|female:Droga|}")[0]?.fallback,
    ).toBeUndefined();
    expect(
      parseTemplatePlaceholders("{guest_count|1:# person|}"),
    ).toMatchObject([
      {
        known: true,
        branches: { "1": "# person" },
        fallback: "",
      },
    ]);
    expect(
      parseTemplatePlaceholders("{receiver_gender|female:jej|male:jego}"),
    ).toMatchObject([
      {
        name: "receiver_gender",
        known: true,
        select: true,
        branches: { female: "jej", male: "jego" },
      },
    ]);
  });
});

describe("templatePlaceholderErrors", () => {
  it("accepts known tokens including budget_line", () => {
    expect(templatePlaceholderErrors("Hi {giver} {budget_line}")).toEqual([]);
    expect(
      templatePlaceholderErrors("{event} {event_dopelniacz} {event_mianownik}"),
    ).toEqual([]);
  });

  it("flags unknown, invalid case, empty, and unclosed tokens", () => {
    expect(templatePlaceholderErrors("{givre}")).toMatchObject([
      { token: "{givre}", reason: "unknown" },
    ]);
    expect(templatePlaceholderErrors("{Giver}")).toMatchObject([
      { token: "{Giver}", reason: "invalid" },
    ]);
    expect(templatePlaceholderErrors("{}")).toMatchObject([
      { token: "{}", reason: "empty" },
    ]);
    expect(templatePlaceholderErrors("{event budget}")).toMatchObject([
      { token: "{event budget}", reason: "invalid" },
    ]);
    expect(templatePlaceholderErrors("Hi {giver")).toMatchObject([
      { token: "{giver", reason: "unclosed" },
    ]);
  });

  it("finds no errors in the default templates", () => {
    expect(templatesViewErrors(emptyTemplatesView())).toEqual([]);
  });

  it("fills missing ids from defaults and skips them in validation", () => {
    const partial = emptyTemplatesView();
    delete (partial.en as Partial<Record<string, string>>)[
      "reveal.previous_title"
    ];
    expect(partial.en["reveal.previous_title"]).toBeUndefined();
    expect(templatesViewErrors(partial)).toEqual([]);
    expect(
      templatesViewWithDefaults(partial).en["reveal.previous_title"],
    ).toBe(TEMPLATE_DEFAULTS.en["reveal.previous_title"]);
    expect(
      renderTemplate(partial, "reveal.previous_title", "en"),
    ).toBe("");
  });

  it("accepts a count select with 1, 2, and fallback", () => {
    expect(
      templatePlaceholderErrors(
        "{guest_count|1:wzięła udział # osoba|2:wzięły udział # osoby|wzięło udział # osób}",
      ),
    ).toEqual([]);
  });

  it("flags unknown count branches", () => {
    expect(
      templatePlaceholderErrors("{guest_count|few:# x|# people}"),
    ).toMatchObject([
      {
        token: "few",
        reason: "unknown_branch",
        message: "few is not a valid choice. Use 1 or 2.",
      },
    ]);
    expect(
      templatePlaceholderErrors("{guest_count|female:# x|# people}"),
    ).toMatchObject([{ token: "female", reason: "unknown_branch" }]);
  });

  it("accepts a gender select with female and male and no fallback", () => {
    expect(
      templatePlaceholderErrors(
        "{giver_gender|female:Droga|male:Drogi} {giver_wolacz}",
      ),
    ).toEqual([]);
  });

  it("flags a gender select with a fallback or trailing pipe", () => {
    expect(
      templatePlaceholderErrors(
        "{giver_gender|female:Droga|male:Drogi|Cześć}",
      ),
    ).toMatchObject([{ reason: "invalid_select", token: "Cześć" }]);
    expect(
      templatePlaceholderErrors("{giver_gender|female:Droga|male:Drogi|}"),
    ).toMatchObject([{ reason: "invalid_select", token: "|" }]);
    expect(
      templatePlaceholderErrors("{receiver_gender|female:jej|Hallo}"),
    ).toMatchObject([{ reason: "invalid_select" }]);
  });

  it("flags an unknown gender branch", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|fmale:Droga|male:Drogi}"),
    ).toMatchObject([
      {
        token: "fmale",
        name: "fmale",
        reason: "unknown_branch",
        message: "fmale is not a valid choice. Use female or male.",
      },
    ]);
  });

  it("flags a select on a non-gender placeholder", () => {
    expect(
      templatePlaceholderErrors("{event|female:Office|male:Shop}"),
    ).toMatchObject([
      {
        reason: "invalid_select",
        message: "{event} cannot use | choices.",
      },
    ]);
  });

  it("flags a duplicate gender branch", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|female:Droga|female:Kochana}"),
    ).toMatchObject([
      {
        token: "female",
        reason: "duplicate_branch",
        message: "female is listed twice.",
      },
    ]);
  });

  it("flags a fallback that is not last", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|Cześć|female:Droga}"),
    ).toMatchObject([{ reason: "invalid_select" }]);
  });

  it("flags nested braces inside a select", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|female:Droga {giver}|male:Drogi}"),
    ).toMatchObject([{ reason: "invalid_select" }]);
  });

  it("flags a select with no keyed branch", () => {
    expect(templatePlaceholderErrors("{giver_gender|Cześć}")).toMatchObject([
      { reason: "invalid_select", token: "|" },
      { reason: "invalid_select", token: "Cześć" },
    ]);
  });

  it("flags an unclosed gender select", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|female:Droga"),
    ).toMatchObject([{ reason: "unclosed" }]);
  });

  it("flags an unclosed select and a bad key together", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|fmale:Droga"),
    ).toMatchObject([
      { reason: "unclosed" },
      { reason: "unknown_branch", token: "fmale" },
    ]);
  });

  it("flags a capitalized gender key", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|Female:Droga|male:Drogi}"),
    ).toMatchObject([
      {
        token: "Female",
        reason: "unknown_branch",
        message: "Female is not a valid choice. Use female or male.",
      },
    ]);
  });

  it("flags an empty branch key", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|:Droga|male:Drogi}"),
    ).toMatchObject([{ reason: "unknown_branch" }]);
  });

  it("flags an empty segment that is not last", () => {
    expect(
      templatePlaceholderErrors("{giver_gender||female:Droga}"),
    ).toMatchObject([{ reason: "invalid_select" }]);
  });

  it("flags a trailing pipe with no keyed branch", () => {
    expect(templatePlaceholderErrors("{giver_gender|}")).toMatchObject([
      { reason: "invalid_select" },
    ]);
  });

  it("flags a select on a non-gender name placeholder", () => {
    expect(
      templatePlaceholderErrors("{giver|female:Droga|male:Drogi}"),
    ).toMatchObject([{ reason: "invalid_select" }]);
  });

  it("flags an unknown name used as a select", () => {
    expect(
      templatePlaceholderErrors("{givre|female:Droga}"),
    ).toMatchObject([{ reason: "unknown" }]);
  });

  it("flags a duplicate male branch", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|male:Drogi|male:Szanowny}"),
    ).toMatchObject([
      {
        token: "male",
        reason: "duplicate_branch",
        message: "male is listed twice.",
      },
    ]);
  });

  it("flags two unknown keys in one token", () => {
    const errors = templatePlaceholderErrors(
      "{giver_gender|fmale:Droga|mlale:Drogi}",
    );
    expect(errors).toMatchObject([
      { token: "fmale", reason: "unknown_branch" },
      { token: "mlale", reason: "unknown_branch" },
    ]);
  });

  it("accepts one gender branch, empty values, and trimmed keys", () => {
    expect(templatePlaceholderErrors("{giver_gender|female:Droga}")).toEqual(
      [],
    );
    expect(templatePlaceholderErrors("{giver_gender|female:}")).toEqual([]);
    expect(templatePlaceholderErrors("{giver_gender|female:Droga|}")).toMatchObject(
      [{ reason: "invalid_select" }],
    );
    expect(
      templatePlaceholderErrors("{giver_gender| female :Droga| male :Drogi}"),
    ).toEqual([]);
  });

  it("uses unknown when a simple placeholder has no parts", () => {
    vi.spyOn(parseMod, "parseTemplatePlaceholders").mockReturnValueOnce([
      {
        start: 0,
        end: 3,
        name: "x",
        closed: false,
        known: false,
        select: false,
        parts: [],
        branches: {},
      },
    ]);
    expect(templatePlaceholderErrors("{x}")).toMatchObject([
      { reason: "unknown", message: "{x} is not a known variable." },
    ]);
  });

  it("falls back to the field id when the catalog has no matching row", () => {
    vi.spyOn(TEMPLATE_FIELDS, "find").mockReturnValue(undefined);
    const view = emptyTemplatesView();
    view.en["email.body"] = "Hi {nope}";
    expect(templatesViewErrors(view)[0]?.label).toBe("email.body");
  });

  it("includes messages on simple placeholder errors", () => {
    expect(templatePlaceholderErrors("{givre}")).toMatchObject([
      { message: "{givre} is not a known variable." },
    ]);
    expect(templatePlaceholderErrors("{Giver}")).toMatchObject([
      { message: "{Giver} is not a valid variable name." },
    ]);
    expect(templatePlaceholderErrors("{}")).toMatchObject([
      { message: "{} is empty. Put a variable name inside the braces." },
    ]);
    expect(templatePlaceholderErrors("{giver")).toMatchObject([
      { message: "{giver is missing a closing }." },
    ]);
  });

  it("surfaces gender select errors on the templates view", () => {
    const view = emptyTemplatesView();
    view.en["email.body"] =
      "{giver_gender|fmale:Droga|male:Drogi} {url}";
    expect(templatesViewErrors(view)).toMatchObject([
      {
        language: "en",
        id: "email.body",
        label: "Body",
        token: "fmale",
        reason: "unknown_branch",
        message: "fmale is not a valid choice. Use female or male.",
      },
    ]);
  });

  it("explains a gender fallback on the Polish empty-wishlist line", () => {
    const view = emptyTemplatesView();
    view.pl["reveal.wishlist_empty"] =
      "{receiver} nie {receiver_gender|female:wpisała|male:wpisał|wpisał(a)} jeszcze żadnych pomysłów na prezent. Zajrzyj tu później.";
    const errors = templatesViewErrors(view);
    expect(errors).toMatchObject([
      {
        language: "pl",
        id: "reveal.wishlist_empty",
        label: "Their wishlist empty",
        token: "wpisał(a)",
        reason: "invalid_select",
        message:
          "{receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
      },
    ]);
    expect(templateErrorLine(errors[0]!)).toBe(
      "Polish · Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
    );
  });

  it("explains a trailing pipe, empty choice, and a select that needs branches", () => {
    expect(
      templatePlaceholderErrors("{giver_gender|female:Droga|male:Drogi|}"),
    ).toMatchObject([
      {
        message:
          "{giver_gender} has a trailing |. Write female: and male: only.",
      },
    ]);
    expect(
      templatePlaceholderErrors("{giver_gender||female:Droga}"),
    ).toMatchObject([
      { message: "{giver_gender} has an empty choice." },
    ]);
    expect(templatePlaceholderErrors("{giver_gender|Cześć}")).toMatchObject([
      { message: "{giver_gender} needs female: or male: choices." },
      {
        message:
          "{giver_gender} cannot use the fallback \u201cCześć\u201d. Write female: and male: only.",
      },
    ]);
    expect(templatePlaceholderErrors("{guest_count|hello}")).toMatchObject([
      { message: "{guest_count} needs 1: or 2: choices." },
    ]);
    expect(templatePlaceholderErrors("{guest_count||1:x|# y}")).toMatchObject([
      { message: "{guest_count} has an empty choice." },
    ]);
  });
});

describe("placeholderErrorMessage", () => {
  it("names each reason", () => {
    expect(placeholderErrorMessage("unknown_branch", "fmale")).toBe(
      "fmale is not a valid choice.",
    );
    expect(
      placeholderErrorMessage("unknown_branch", "fmale", {
        varName: "giver_gender",
      }),
    ).toBe("fmale is not a valid choice. Use female or male.");
    expect(
      placeholderErrorMessage("unknown_branch", "few", {
        varName: "guest_count",
      }),
    ).toBe("few is not a valid choice. Use 1 or 2.");
    expect(
      placeholderErrorMessage("unknown_branch", "", {
        varName: "giver_gender",
      }),
    ).toBe("That choice has no name. Use female or male.");
    expect(placeholderErrorMessage("duplicate_branch", "female")).toBe(
      "female is listed twice.",
    );
    expect(placeholderErrorMessage("invalid_select", "event")).toBe(
      "{event} cannot use | choices.",
    );
    expect(
      placeholderErrorMessage("invalid_select", "giver_gender", {
        kind: "text",
        token: "wpisał(a)",
        varName: "receiver_gender",
      }),
    ).toBe(
      "{receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
    );
    expect(
      placeholderErrorMessage("invalid_select", "giver_gender", {
        kind: "text",
        token: "Droga {giver}",
        varName: "giver_gender",
      }),
    ).toBe("{giver_gender} cannot contain another { inside a choice.");
    expect(
      placeholderErrorMessage("invalid_select", "guest_count", {
        kind: "pipe",
        keyed: true,
        lastPart: true,
        token: "|",
        varName: "guest_count",
      }),
    ).toBe(
      "{guest_count} has a trailing |. Write 1: and 2: choices, then an optional fallback.",
    );
    expect(
      placeholderErrorMessage("invalid_select", "guest_count", {
        kind: "text",
        token: "people",
        varName: "guest_count",
      }),
    ).toBe(
      "{guest_count} cannot use the fallback \u201cpeople\u201d. Write 1: and 2: choices, then an optional fallback.",
    );
    expect(
      placeholderErrorMessage("invalid_select", "guest_count", {
        kind: "pipe",
        keyed: false,
        varName: "guest_count",
      }),
    ).toBe("{guest_count} needs 1: or 2: choices.");
    expect(placeholderErrorMessage("unclosed", "giver")).toBe(
      "{giver is missing a closing }.",
    );
    expect(placeholderErrorMessage("empty", "")).toBe(
      "{} is empty. Put a variable name inside the braces.",
    );
    expect(placeholderErrorMessage("invalid", "Giver")).toBe(
      "{Giver} is not a valid variable name.",
    );
    expect(placeholderErrorMessage("unknown", "givre")).toBe(
      "{givre} is not a known variable.",
    );
    expect(placeholderErrorMessage("not_allowed", "receiver")).toBe(
      "{receiver} cannot be used in this template.",
    );
    expect(
      placeholderErrorMessage("nope" as TemplatePlaceholderErrorReason, "x"),
    ).toBe("{x} is not a known variable.");
  });
});

describe("suggestTemplatePlaceholders", () => {
  it("returns every placeholder for an empty query", () => {
    expect(suggestTemplatePlaceholders("")).toEqual([...TEMPLATE_PLACEHOLDERS]);
    expect(suggestTemplatePlaceholders("  ")).toEqual([
      ...TEMPLATE_PLACEHOLDERS,
    ]);
  });

  it("filters the giver family by prefix", () => {
    expect(suggestTemplatePlaceholders("giv")).toEqual(
      TEMPLATE_PLACEHOLDERS.filter((name) => name.startsWith("giv")),
    );
  });

  it("ranks giver for the givre typo", () => {
    const names = suggestTemplatePlaceholders("givre");
    expect(names).toContain("giver");
    expect(names[0]).toBe("giver");
  });

  it("returns nothing for an unrelated query", () => {
    expect(suggestTemplatePlaceholders("zzzzzz")).toEqual([]);
    expect(suggestTemplatePlaceholders("zz")).toEqual([]);
    expect(suggestTemplatePlaceholders("xyz")).toEqual([]);
  });

  it("ranks an exact placeholder name first", () => {
    expect(suggestTemplatePlaceholders("url")[0]).toBe("url");
  });

  it("ranks only the names passed in for a restricted field", () => {
    expect(suggestTemplatePlaceholders("", ["giver", "url", "button"])).toEqual(
      ["giver", "url", "button"],
    );
    expect(
      suggestTemplatePlaceholders("rec", ["giver", "url", "button"]),
    ).toEqual([]);
  });
});

describe("suggestSelectBranchKeys", () => {
  it("returns female and male for an empty query", () => {
    expect(suggestSelectBranchKeys("")).toEqual([...GENDER_CODES]);
  });

  it("returns 1 and 2 for a guest_count select", () => {
    expect(suggestSelectBranchKeys("", "guest_count")).toEqual(["1", "2"]);
    expect(suggestSelectBranchKeys("1", "guest_count")).toEqual(["1"]);
    expect(suggestSelectBranchKeys("2", "guest_count")).toEqual(["2"]);
  });

  it("filters by prefix", () => {
    expect(suggestSelectBranchKeys("fe")).toEqual(["female"]);
    expect(suggestSelectBranchKeys("m")).toEqual(["male"]);
  });

  it("ranks female for the fmale typo", () => {
    const names = suggestSelectBranchKeys("fmale");
    expect(names).toContain("female");
    expect(names[0]).toBe("female");
  });

  it("returns nothing for an unrelated or too-short query", () => {
    expect(suggestSelectBranchKeys("zzzzzz")).toEqual([]);
    expect(suggestSelectBranchKeys("x")).toEqual([]);
  });
});

describe("templatePlaceholderAt / insertTemplatePlaceholder", () => {
  it("reads the query up to the caret inside a token", () => {
    const text = "Hi {givre}!";
    expect(templatePlaceholderAt(text, 6)).toEqual({
      start: 3,
      end: 10,
      query: "gi",
      closed: true,
      mode: "name",
    });
  });

  it("opens after a bare brace", () => {
    expect(templatePlaceholderAt("Hi {", 4)).toEqual({
      start: 3,
      end: 4,
      query: "",
      closed: false,
      mode: "name",
    });
  });

  it("is null after a closed token", () => {
    expect(templatePlaceholderAt("Hi {giver}!", 10)).toBeNull();
  });

  it("replaces the token under the caret", () => {
    expect(insertTemplatePlaceholder("Hi {givre}!", 8, "giver")).toEqual({
      text: "Hi {giver}!",
      cursor: 10,
    });
  });

  it("reads a gender branch key under the caret", () => {
    const text = "{giver_gender|fmale:Droga}";
    const at = text.indexOf("fmale") + 2;
    expect(templatePlaceholderAt(text, at)).toMatchObject({
      mode: "branch_key",
      query: "fm",
      hasColon: true,
      closed: true,
    });
  });

  it("is null in gender branch text", () => {
    const text = "{giver_gender|female:Droga}";
    expect(
      templatePlaceholderAt(text, text.indexOf("Droga") + 2),
    ).toBeNull();
  });

  it("replaces a mistyped gender key and keeps the colon", () => {
    const text = "{giver_gender|fmale:Droga}";
    const cursor = text.indexOf("fmale") + 2;
    expect(insertTemplatePlaceholder(text, cursor, "female")).toEqual({
      text: "{giver_gender|female:Droga}",
      cursor: "{giver_gender|female".length,
    });
  });

  it("inserts a colon when completing a gender key", () => {
    const text = "{giver_gender|fm}";
    const cursor = text.indexOf("fm") + 2;
    expect(insertTemplatePlaceholder(text, cursor, "female")).toEqual({
      text: "{giver_gender|female:}",
      cursor: "{giver_gender|female:".length,
    });
  });

  it("inserts a colon when completing a count key", () => {
    const text = "{guest_count|}";
    expect(
      insertTemplatePlaceholder(text, text.indexOf("|") + 1, "1"),
    ).toEqual({
      text: "{guest_count|1:}",
      cursor: "{guest_count|1:".length,
    });
  });

  it("opens branch-key mode after a pipe with an empty query", () => {
    const text = "{giver_gender|";
    expect(templatePlaceholderAt(text, text.length)).toMatchObject({
      mode: "branch_key",
      selectVar: "giver_gender",
      query: "",
      hasColon: false,
      closed: false,
    });
  });

  it("opens count branch-key mode after a pipe", () => {
    const text = "{guest_count|";
    expect(templatePlaceholderAt(text, text.length)).toMatchObject({
      mode: "branch_key",
      selectVar: "guest_count",
      query: "",
      hasColon: false,
      closed: false,
    });
  });

  it("reads the second branch key", () => {
    const text = "{giver_gender|female:Droga|m}";
    expect(
      templatePlaceholderAt(text, text.indexOf("|m") + 2),
    ).toMatchObject({
      mode: "branch_key",
      query: "m",
      hasColon: false,
    });
  });

  it("stays in name mode before the first pipe of a select", () => {
    const text = "{giver_gender|female:Droga}";
    expect(
      templatePlaceholderAt(text, text.indexOf("gender") + 3),
    ).toMatchObject({
      mode: "name",
      query: "giver_gen",
    });
  });

  it("does not suggest inside a non-select placeholder", () => {
    expect(templatePlaceholderAt("{event|fe", 8)).toBeNull();
  });

  it("is null on a pipe between select branches", () => {
    const text = "{giver_gender|female:Hi|male:Ho}";
    expect(templatePlaceholderAt(text, text.indexOf("|male"))).toBeNull();
  });

  it("stops at a nested opening brace before the closer", () => {
    const text = "{aa{bb}";
    expect(templatePlaceholderAt(text, 3)).toMatchObject({
      start: 0,
      end: 3,
      query: "aa",
      mode: "name",
    });
  });

  it("is null at the start of the string and after a closed select", () => {
    expect(templatePlaceholderAt("{giver}", 0)).toBeNull();
    expect(
      templatePlaceholderAt("{giver_gender|female:Droga}!", 27),
    ).toBeNull();
  });

  it("replaces the whole select when inserting a name-mode placeholder", () => {
    const text = "{giver_gender|female:Droga}";
    const cursor = text.indexOf("giver") + 2;
    expect(insertTemplatePlaceholder(text, cursor, "giver")).toEqual({
      text: "{giver}",
      cursor: "{giver}".length,
    });
  });

  it("inserts a token when the caret is outside braces", () => {
    expect(insertTemplatePlaceholder("Hi ", 3, "giver")).toEqual({
      text: "Hi {giver}",
      cursor: "Hi {giver}".length,
    });
  });

  it("replaces a spaced mistyped key without eating the colon", () => {
    const text = "{giver_gender| fmale :Droga}";
    const cursor = text.indexOf("fmale") + 2;
    expect(insertTemplatePlaceholder(text, cursor, "female")).toEqual({
      text: "{giver_gender| female :Droga}",
      cursor: "{giver_gender| female".length,
    });
  });
});

describe("templatePatchErrors", () => {
  it("ignores blank values that restore defaults", () => {
    expect(
      templatePatchErrors({
        en: { "email.subject": "" },
      }),
    ).toEqual([]);
  });

  it("reports unknown tokens on a patched field", () => {
    expect(
      templatePatchErrors({
        en: { "email.body": "Hi {givre}!" },
      }),
    ).toMatchObject([
      {
        language: "en",
        id: "email.body",
        label: "Body",
        token: "{givre}",
        reason: "unknown",
        message: "{givre} is not a known variable.",
      },
    ]);
  });

  it("reports an unknown gender branch on a patched field", () => {
    expect(
      templatePatchErrors({
        en: {
          "email.body": "{giver_gender|fmale:Droga|male:Drogi} {giver}",
        },
      }),
    ).toMatchObject([
      {
        language: "en",
        id: "email.body",
        token: "fmale",
        reason: "unknown_branch",
        message: "fmale is not a valid choice. Use female or male.",
      },
    ]);
  });
});

describe("invalid template copy", () => {
  it("counts one template even when it has two problems", () => {
    const view = emptyTemplatesView();
    view.pl["reveal.wishlist_empty"] =
      "{receiver_gender|female:wpisała|male:wpisał|wpisał(a)} {nope}";
    const errors = templatesViewErrors(view);
    expect(errors.length).toBeGreaterThan(1);
    expect(invalidTemplateCount(errors)).toBe(1);
    expect(templateErrorCounts(errors).total).toBe(errors.length);
    expect(invalidTemplatesHeading(1)).toBe("1 template is not valid");
    expect(invalidTemplatesHeading(2)).toBe("2 templates are not valid");
    expect(invalidTemplatesSaveReason(1)).toBe(
      "Save is disabled because 1 template is not valid.",
    );
    expect(invalidTemplatesReason(emptyTemplatesView())).toBeNull();
    expect(invalidTemplatesReason(view)).toBe(
      "Cannot send invitations because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
    );
  });

  it("counts every problem line by language", () => {
    const view = emptyTemplatesView();
    view.en["email.body"] = "Hi {givre} {nope}";
    view.pl["reveal.wishlist_empty"] =
      "{receiver_gender|female:wpisała|male:wpisał|wpisał(a)}";
    const counts = templateErrorCounts(templatesViewErrors(view));
    expect(counts).toEqual({
      total: 3,
      byLanguage: { en: 2, pl: 1, de: 0, es: 0, ja: 0 },
    });
    expect(templateErrorCounts([])).toEqual({
      total: 0,
      byLanguage: { en: 0, pl: 0, de: 0, es: 0, ja: 0 },
    });
    expect(templateErrorTotal(view)).toBe(3);
    expect(templateErrorTotal(emptyTemplatesView())).toBe(0);
  });

  it("names each broken template in the send reason", () => {
    const view = emptyTemplatesView();
    view.en["email.body"] = "Hi {givre}";
    view.pl["reveal.wishlist_empty"] =
      "{receiver} nie {receiver_gender|female:wpisała|male:wpisał|wpisał(a)} jeszcze.";
    expect(invalidTemplatesReason(view)).toBe(
      "Cannot send invitations because 2 templates are not valid: English Invitation · Body: {givre} is not a known variable.; Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
    );
  });

  it("uses the field id when the catalog has no row", () => {
    vi.spyOn(TEMPLATE_FIELDS, "find").mockReturnValue(undefined);
    expect(templateErrorPath("email.body", "email.body")).toBe("email.body");
    expect(
      templateErrorLine({
        language: "en",
        id: "email.body",
        label: "email.body",
        token: "{nope}",
        reason: "unknown",
        message: "{nope} is not a known variable.",
      }),
    ).toBe("English · email.body: {nope} is not a known variable.");
  });

  it("keeps a shared label when the item catalog has no row", () => {
    vi.spyOn(TEMPLATE_ITEMS, "find").mockReturnValue(undefined);
    expect(templateErrorPath("email.body", "Body")).toBe("Body");
  });

  it("wraps a problem line for the save API", () => {
    const view = emptyTemplatesView();
    view.en["email.body"] = "Hi {givre}";
    const error = templatesViewErrors(view)[0]!;
    expect(invalidPlaceholderRequestError(error)).toBe(
      "Invalid placeholder in English · Invitation · Body: {givre} is not a known variable.",
    );
    expect(
      invalidPlaceholderRequestError({
        ...error,
        message: "{givre} is not a known variable",
      }),
    ).toBe(
      "Invalid placeholder in English · Invitation · Body: {givre} is not a known variable.",
    );
  });
});
