import { describe, expect, it } from "vitest";
import {
  agreedIdentityFill,
  dirtyGuestFields,
  emptyGuestDraftSource,
  fillEmptyIdentity,
  guestFieldsAreDirty,
  sameNameQuestion,
  type GuestDraftSnapshot,
  type GuestDraftSource,
} from "./guest-draft";
import { emptyNameCaseForm } from "./name-cases";

function snapshot(
  overrides: Partial<GuestDraftSnapshot> = {},
): GuestDraftSnapshot {
  return {
    name: "",
    phone: "",
    email: "",
    language: "pl",
    gender: null,
    cases: emptyNameCaseForm(),
    ...overrides,
  };
}

function source(overrides: Partial<GuestDraftSource> = {}): GuestDraftSource {
  return {
    ...emptyGuestDraftSource(),
    ...overrides,
  };
}

describe("emptyGuestDraftSource", () => {
  it("matches an empty draft snapshot", () => {
    expect(
      guestFieldsAreDirty(dirtyGuestFields(snapshot(), emptyGuestDraftSource())),
    ).toBe(false);
  });
});

describe("dirtyGuestFields", () => {
  it("marks only the fields that differ from the saved guest", () => {
    const saved = source({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
      language: "pl",
      gender: "female",
      nameWolacz: "Ado",
    });
    const dirty = dirtyGuestFields(
      snapshot({
        name: "Ada Lovelace",
        phone: "351912345678",
        email: "ada@example.com",
        language: "en",
        gender: "female",
        cases: { ...emptyNameCaseForm(), nameWolacz: "Ado" },
      }),
      saved,
    );

    expect(dirty.name).toBe(true);
    expect(dirty.language).toBe(true);
    expect(dirty.phone).toBe(false);
    expect(dirty.email).toBe(false);
    expect(dirty.gender).toBe(false);
    expect(dirty.cases.nameWolacz).toBe(false);
    expect(dirty.cases.nameBiernik).toBe(false);
    expect(guestFieldsAreDirty(dirty)).toBe(true);
  });

  it("treats null and empty contact fields as the same", () => {
    const dirty = dirtyGuestFields(snapshot(), source({ phone: null, email: null }));
    expect(dirty.phone).toBe(false);
    expect(dirty.email).toBe(false);
    expect(guestFieldsAreDirty(dirty)).toBe(false);
  });

  it("marks a Polish case dirty without flagging the others", () => {
    const dirty = dirtyGuestFields(
      snapshot({
        name: "Ada",
        cases: { ...emptyNameCaseForm(), nameBiernik: "Adę" },
      }),
      source({ name: "Ada" }),
    );
    expect(dirty.cases.nameBiernik).toBe(true);
    expect(dirty.cases.nameWolacz).toBe(false);
    expect(guestFieldsAreDirty(dirty)).toBe(true);
  });

  it("does not treat an attached existing person as dirty", () => {
    const person = source({
      name: "Bea",
      phone: "351911111111",
      email: "bea@example.com",
      language: "en",
      gender: "female",
      nameCelownik: "Bei",
    });
    const dirty = dirtyGuestFields(
      snapshot({
        name: "Bea",
        phone: "351911111111",
        email: "bea@example.com",
        language: "en",
        gender: "female",
        cases: { ...emptyNameCaseForm(), nameCelownik: "Bei" },
      }),
      person,
    );
    expect(guestFieldsAreDirty(dirty)).toBe(false);
  });
});

describe("agreedIdentityFill", () => {
  it("returns nothing when there is no match", () => {
    expect(agreedIdentityFill([])).toEqual({ gender: null, cases: {} });
  });

  it("copies a single match's gender and non-empty cases", () => {
    expect(
      agreedIdentityFill([
        {
          gender: "female",
          nameDopelniacz: "Anny",
          nameCelownik: "Annie",
          nameBiernik: "Annę",
          nameNarzednik: "Anną",
          nameMiejscownik: "Annie",
          nameWolacz: "Anno",
        },
      ]),
    ).toEqual({
      gender: "female",
      cases: {
        nameDopelniacz: "Anny",
        nameCelownik: "Annie",
        nameBiernik: "Annę",
        nameNarzednik: "Anną",
        nameMiejscownik: "Annie",
        nameWolacz: "Anno",
      },
    });
  });

  it("keeps a field only when every match agrees on a non-empty value", () => {
    expect(
      agreedIdentityFill([
        { gender: "female", nameDopelniacz: "Anny", nameWolacz: "Anno" },
        { gender: "female", nameDopelniacz: " Anny ", nameWolacz: "Anno" },
      ]),
    ).toEqual({
      gender: "female",
      cases: { nameDopelniacz: "Anny", nameWolacz: "Anno" },
    });
  });

  it("omits a field when a match is blank or the values differ", () => {
    expect(
      agreedIdentityFill([
        { gender: "female", nameDopelniacz: "Anny", nameWolacz: "Anno" },
        { gender: "male", nameDopelniacz: " ", nameWolacz: "Aniu" },
      ]),
    ).toEqual({ gender: null, cases: {} });
    expect(
      agreedIdentityFill([{ gender: null, nameDopelniacz: null }]),
    ).toEqual({ gender: null, cases: {} });
  });
});

describe("fillEmptyIdentity", () => {
  const anna = {
    gender: "female" as const,
    nameDopelniacz: "Anny",
    nameWolacz: "Anno",
  };

  it("fills only the gender and cases that are still empty", () => {
    expect(
      fillEmptyIdentity(
        {
          gender: null,
          cases: { ...emptyNameCaseForm(), nameWolacz: "Already" },
        },
        [anna],
      ),
    ).toEqual({
      gender: "female",
      cases: { ...emptyNameCaseForm(), nameDopelniacz: "Anny", nameWolacz: "Already" },
    });
  });

  it("leaves a chosen gender in place", () => {
    expect(
      fillEmptyIdentity(
        { gender: "male", cases: emptyNameCaseForm() },
        [anna],
      ).gender,
    ).toBe("male");
  });
});

describe("sameNameQuestion", () => {
  it("names several editions, one edition, and no edition", () => {
    expect(
      sameNameQuestion({
        name: "Ada",
        events: [
          { name: "Xmas", occursOn: "2026-12-24" },
          { name: "Office", occursOn: "2026-01-01" },
          { name: " Picnic ", occursOn: "2025-06-02" },
        ],
      }),
    ).toBe(
      "A person named Ada is already in these editions: Xmas (24 Dec 2026), Office (1 Jan 2026), and Picnic (2 Jun 2025). Is this the same person, or a new one?",
    );
    expect(
      sameNameQuestion({
        name: "Ada",
        events: [
          { name: "Xmas", occursOn: "2026-12-24" },
          { name: "Office", occursOn: "2026-01-01" },
        ],
      }),
    ).toBe(
      "A person named Ada is already in these editions: Xmas (24 Dec 2026) and Office (1 Jan 2026). Is this the same person, or a new one?",
    );
    expect(
      sameNameQuestion({
        name: "Ada",
        events: [{ name: "Xmas", occursOn: "2026-12-24" }],
      }),
    ).toBe(
      "A person named Ada is already in these editions: Xmas (24 Dec 2026). Is this the same person, or a new one?",
    );
    expect(sameNameQuestion({ name: " Ada ", events: [] })).toBe(
      "A person named Ada has not been in an edition yet. Is this the same person, or a new one?",
    );
  });
});
