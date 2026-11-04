import { describe, expect, it } from "vitest";
import {
  OPTIONAL_NAME_CASE_FIELDS,
  declinedName,
  fillEmptyNameCases,
  missingNameCases,
  missingPolishCasesMessage,
  nameCaseFormFrom,
  nameCases,
  nameVars,
  normalizeNameCase,
  optionalNameCasesFromBody,
  optionalNameCasesPatch,
  resolvedNameCases,
} from "@/lib/name-cases";
import { interpolate } from "@/lib/templates";

describe("case question hints", () => {
  it("names the question each case answers", () => {
    expect(
      Object.fromEntries(
        OPTIONAL_NAME_CASE_FIELDS.map((c) => [c.key, c.hint]),
      ),
    ).toEqual({
      dopelniacz: "kogo nie ma?",
      celownik: "komu się przyglądam?",
      biernik: "kogo widzę?",
      narzednik: "z kim idę?",
      miejscownik: "o kim mówię?",
      wolacz: "hej, …!",
    });
  });
});

describe("normalizeNameCase", () => {
  it("trims and treats blank as null", () => {
    expect(normalizeNameCase("  Anny ")).toBe("Anny");
    expect(normalizeNameCase("")).toBeNull();
    expect(normalizeNameCase("   ")).toBeNull();
    expect(normalizeNameCase(null)).toBeNull();
    expect(normalizeNameCase(undefined)).toBeNull();
  });
});

describe("missingNameCases", () => {
  it("lists every blank case in field order", () => {
    expect(missingNameCases(null)).toEqual([
      "Dopełniacz",
      "Celownik",
      "Biernik",
      "Narzędnik",
      "Miejscownik",
      "Wołacz",
    ]);
    expect(
      missingNameCases({
        nameDopelniacz: " Anny ",
        nameWolacz: "  ",
      }),
    ).toEqual([
      "Celownik",
      "Biernik",
      "Narzędnik",
      "Miejscownik",
      "Wołacz",
    ]);
  });

  it("builds the save error and treats a complete set as ready", () => {
    expect(missingPolishCasesMessage({ nameWolacz: "Anno" })).toBe(
      "Enter the missing Polish cases: Dopełniacz, Celownik, Biernik, Narzędnik, Miejscownik.",
    );
    expect(
      missingPolishCasesMessage({
        nameDopelniacz: "Anny",
        nameCelownik: "Annie",
        nameBiernik: "Annę",
        nameNarzednik: "Anną",
        nameMiejscownik: "Annie",
        nameWolacz: "Anno",
      }),
    ).toBeNull();
  });

  it("keeps a stored case when the incoming value is blank", () => {
    expect(
      resolvedNameCases(
        { nameDopelniacz: "Anny" },
        { nameDopelniacz: "Other", nameWolacz: "Anno" },
      ),
    ).toEqual({
      nameDopelniacz: "Anny",
      nameCelownik: null,
      nameBiernik: null,
      nameNarzednik: null,
      nameMiejscownik: null,
      nameWolacz: "Anno",
    });
  });
});

describe("declinedName", () => {
  it("returns the nominative for mianownik", () => {
    expect(declinedName(nameCases("Anna"), "mianownik")).toBe("Anna");
  });

  it("falls back to the nominative when a case is empty", () => {
    expect(declinedName(nameCases("Anna"), "dopelniacz")).toBe("Anna");
    expect(
      declinedName(nameCases("Anna", { nameDopelniacz: "Anny" }), "dopelniacz"),
    ).toBe("Anny");
  });
});

describe("nameVars", () => {
  it("aliases mianownik to the bare prefix and falls back", () => {
    expect(nameVars("giver", nameCases("Anna"))).toMatchObject({
      giver: "Anna",
      giver_mianownik: "Anna",
      giver_dopelniacz: "Anna",
      giver_wolacz: "Anna",
      giver_gender: "",
    });
  });

  it("exposes gender when set", () => {
    expect(
      nameVars("giver", nameCases("Anna", { gender: "female" })),
    ).toMatchObject({
      giver: "Anna",
      giver_gender: "female",
    });
    expect(
      nameVars("receiver", nameCases("Jan", { gender: "male" })),
    ).toMatchObject({
      receiver: "Jan",
      receiver_gender: "male",
    });
  });

  it("skips gender for event names", () => {
    expect(nameVars("event", nameCases("Święta"))).toEqual({
      event: "Święta",
      event_mianownik: "Święta",
      event_dopelniacz: "Święta",
      event_celownik: "Święta",
      event_biernik: "Święta",
      event_narzednik: "Święta",
      event_miejscownik: "Święta",
      event_wolacz: "Święta",
    });
  });

  it("uses stored cases when present", () => {
    expect(
      nameVars(
        "receiver",
        nameCases("Anna Kowalska", {
          nameDopelniacz: "Anny Kowalskiej",
          nameWolacz: "Anno Kowalska",
        }),
      ),
    ).toMatchObject({
      receiver: "Anna Kowalska",
      receiver_mianownik: "Anna Kowalska",
      receiver_dopelniacz: "Anny Kowalskiej",
      receiver_wolacz: "Anno Kowalska",
      receiver_celownik: "Anna Kowalska",
    });
  });
});

describe("nameCaseFormFrom", () => {
  it("returns empty fields when there is no person", () => {
    expect(nameCaseFormFrom(null)).toEqual({
      nameDopelniacz: "",
      nameCelownik: "",
      nameBiernik: "",
      nameNarzednik: "",
      nameMiejscownik: "",
      nameWolacz: "",
    });
  });

  it("copies stored cases and treats missing as blank", () => {
    expect(
      nameCaseFormFrom({
        name: "Anna",
        nameDopelniacz: "Anny",
        nameWolacz: null,
      }),
    ).toMatchObject({
      nameDopelniacz: "Anny",
      nameWolacz: "",
      nameCelownik: "",
    });
  });
});

describe("optionalNameCasesFromBody / patch / fill", () => {
  it("normalizes every case on create-style bodies", () => {
    expect(
      optionalNameCasesFromBody({
        nameDopelniacz: " Anny ",
        nameWolacz: "  ",
      }),
    ).toEqual({
      nameDopelniacz: "Anny",
      nameCelownik: null,
      nameBiernik: null,
      nameNarzednik: null,
      nameMiejscownik: null,
      nameWolacz: null,
    });
  });

  it("only patches keys that were provided", () => {
    expect(
      optionalNameCasesPatch({
        nameDopelniacz: "Anny",
        nameWolacz: "",
      }),
    ).toEqual({
      nameDopelniacz: "Anny",
      nameWolacz: null,
    });
  });

  it("fills empty stored cases without overwriting", () => {
    const existing = nameCases("Anna", { nameDopelniacz: "Anny" });
    expect(
      fillEmptyNameCases(existing, {
        nameDopelniacz: "Other",
        nameWolacz: "Anno",
      }),
    ).toEqual({ nameWolacz: "Anno" });
  });
});

describe("interpolate with name cases", () => {
  it("replaces giver cases and leaves omitted receiver keys literal", () => {
    const vars = nameVars("giver", nameCases("Ada", { nameWolacz: "Adziu" }));
    expect(interpolate("Cześć, {giver_wolacz}", vars)).toBe("Cześć, Adziu");
    expect(interpolate("dla {receiver_dopelniacz}", vars)).toBe(
      "dla {receiver_dopelniacz}",
    );
  });

  it("falls back so {giver_dopelniacz} matches {giver} when unset", () => {
    const vars = nameVars("giver", nameCases("Ada"));
    expect(interpolate("{giver} / {giver_dopelniacz}", vars)).toBe("Ada / Ada");
  });

  it("replaces gender placeholders", () => {
    const vars = nameVars("giver", nameCases("Ada", { gender: "female" }));
    expect(interpolate("{giver} ({giver_gender})", vars)).toBe("Ada (female)");
    expect(interpolate("{receiver_gender}", vars)).toBe("{receiver_gender}");
  });
});
