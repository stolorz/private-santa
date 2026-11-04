import { describe, expect, it } from "vitest";
import {
  emptyEventNameFields,
  eventNameFieldsFrom,
  eventNameOverlays,
  eventNominative,
  eventVars,
  missingEventNameCasesMessage,
  missingEventTranslations,
  missingEventTranslationsMessage,
  missingEventTranslationsSendReason,
} from "@/lib/event-name";

const family = eventNameFieldsFrom({
  name: "Family Christmas 2026",
  nameEn: "Family Christmas 2026",
  nameDe: "Familienweihnachten 2026",
  nameEs: "Navidad familiar 2026",
  nameJa: "ファミリークリスマス 2026",
  namePl: "Rodzinne Święta 2026",
  nameDopelniacz: "Rodzinnych Świąt 2026",
  nameMiejscownik: "Rodzinnych Świętach 2026",
});

describe("missingEventTranslations", () => {
  const complete = {
    namePl: "Święta",
    nameDe: "Weihnachten",
    nameEs: "Navidad",
    nameJa: "クリスマス",
  };

  it("lists blank and whitespace overlays, and ignores the English overlay", () => {
    expect(missingEventTranslations(null)).toEqual([
      "Polish",
      "German",
      "Spanish",
      "Japanese",
    ]);
    expect(missingEventTranslations(undefined)).toEqual([
      "Polish",
      "German",
      "Spanish",
      "Japanese",
    ]);
    expect(
      missingEventTranslations({
        namePl: "  ",
        nameDe: "Weihnachten",
        nameEs: "",
        nameJa: "クリスマス",
      }),
    ).toEqual(["Polish", "Spanish"]);
    expect(missingEventTranslations(complete)).toEqual([]);
    expect(missingEventTranslations(family)).toEqual([]);
  });

  it("explains a save and a send, and stays quiet when all four are set", () => {
    const partial = {
      namePl: "Święta",
      nameDe: " ",
      nameEs: null,
      nameJa: "クリスマス",
    };
    expect(missingEventTranslationsMessage(partial)).toBe(
      "Enter the missing event name translations: German, Spanish.",
    );
    expect(missingEventTranslationsSendReason(partial)).toBe(
      "Cannot send invitations because the event is missing name translations: German, Spanish.",
    );
    expect(missingEventTranslationsMessage(complete)).toBeNull();
    expect(missingEventTranslationsSendReason(family)).toBeNull();
  });
});

describe("missingEventNameCasesMessage", () => {
  it("names every blank case, including whitespace", () => {
    expect(missingEventNameCasesMessage(null)).toBe(
      "Enter the missing Polish cases for the event name: Dopełniacz, Celownik, Biernik, Narzędnik, Miejscownik, Wołacz.",
    );
    expect(
      missingEventNameCasesMessage({
        nameDopelniacz: "Świąt",
        nameCelownik: "  ",
        nameBiernik: "Święta",
        nameNarzednik: "Świętami",
        nameMiejscownik: "Świętach",
        nameWolacz: "Święta",
      }),
    ).toBe(
      "Enter the missing Polish cases for the event name: Celownik.",
    );
  });

  it("stays quiet when every case is filled", () => {
    expect(
      missingEventNameCasesMessage({
        nameDopelniacz: "Świąt",
        nameCelownik: "Świętom",
        nameBiernik: "Święta",
        nameNarzednik: "Świętami",
        nameMiejscownik: "Świętach",
        nameWolacz: "Święta",
      }),
    ).toBeNull();
  });
});

describe("eventNominative", () => {
  it("uses the Polish overlay and the canonical English name", () => {
    expect(eventNominative(family, "en")).toBe("Family Christmas 2026");
    expect(eventNominative(family, "pl")).toBe("Rodzinne Święta 2026");
    expect(eventNominative(emptyEventNameFields("Xmas"), "en")).toBe("Xmas");
    expect(eventNominative(emptyEventNameFields("Xmas"), "pl")).toBe("Xmas");
  });

  it("uses English, German, Spanish, and Japanese overlays", () => {
    expect(
      eventNominative(
        eventNameFieldsFrom({ name: "shopping", nameEn: "Family Christmas" }),
        "en",
      ),
    ).toBe("Family Christmas");
    expect(eventNominative(family, "de")).toBe("Familienweihnachten 2026");
    expect(eventNominative(family, "es")).toBe("Navidad familiar 2026");
    expect(eventNominative(family, "ja")).toBe("ファミリークリスマス 2026");
    expect(
      eventNominative(
        eventNameFieldsFrom({ name: "Family Christmas 2026" }),
        "ja",
      ),
    ).toBe("Family Christmas 2026");
    expect(eventNominative(family, "fr")).toBe("Family Christmas 2026");
  });

  it("ignores a blank Polish overlay", () => {
    const event = eventNameFieldsFrom({
      name: "Xmas",
      namePl: "  ",
    });
    expect(eventNominative(event, "en")).toBe("Xmas");
    expect(eventNominative(event, "pl")).toBe("Xmas");
  });
});

describe("eventVars", () => {
  it("localizes {event} and {event_mianownik} without changing Polish cases", () => {
    expect(eventVars(family, "en")).toMatchObject({
      event: "Family Christmas 2026",
      event_mianownik: "Family Christmas 2026",
      event_dopelniacz: "Rodzinnych Świąt 2026",
      event_miejscownik: "Rodzinnych Świętach 2026",
    });
    expect(eventVars(family, "pl")).toMatchObject({
      event: "Rodzinne Święta 2026",
      event_mianownik: "Rodzinne Święta 2026",
      event_dopelniacz: "Rodzinnych Świąt 2026",
    });
    expect(eventVars(family, "ja")).toMatchObject({
      event: "ファミリークリスマス 2026",
      event_mianownik: "ファミリークリスマス 2026",
      event_dopelniacz: "Rodzinnych Świąt 2026",
    });
  });

  it("falls blank cases back to the Polish nominative, not English", () => {
    const vars = eventVars(family, "en");
    expect(vars.event_celownik).toBe("Rodzinne Święta 2026");
    expect(vars.event_wolacz).toBe("Rodzinne Święta 2026");
    expect(vars.event_celownik).not.toBe("Family Christmas 2026");
  });

  it("uses the canonical name as Polish nominative when namePl is blank", () => {
    const event = eventNameFieldsFrom({
      name: "Xmas",
      nameDopelniacz: "Xmasu",
    });
    expect(eventVars(event, "en")).toMatchObject({
      event: "Xmas",
      event_mianownik: "Xmas",
      event_dopelniacz: "Xmasu",
      event_celownik: "Xmas",
    });
    expect(eventVars(event, "pl")).toMatchObject({
      event: "Xmas",
      event_dopelniacz: "Xmasu",
    });
  });

  it("does not expose a gender placeholder", () => {
    expect(eventVars(family, "pl")).not.toHaveProperty("event_gender");
  });
});

describe("eventNameOverlays", () => {
  it("copies the Polish name and cases without the canonical name", () => {
    expect(eventNameOverlays(family)).toEqual({
      nameEn: "Family Christmas 2026",
      nameDe: "Familienweihnachten 2026",
      nameEs: "Navidad familiar 2026",
      nameJa: "ファミリークリスマス 2026",
      namePl: "Rodzinne Święta 2026",
      nameDopelniacz: "Rodzinnych Świąt 2026",
      nameCelownik: null,
      nameBiernik: null,
      nameNarzednik: null,
      nameMiejscownik: "Rodzinnych Świętach 2026",
      nameWolacz: null,
    });
    expect(eventNameOverlays(undefined)).toEqual({
      nameEn: null,
      nameDe: null,
      nameEs: null,
      nameJa: null,
      namePl: null,
      nameDopelniacz: null,
      nameCelownik: null,
      nameBiernik: null,
      nameNarzednik: null,
      nameMiejscownik: null,
      nameWolacz: null,
    });
  });
});
