import { describe, expect, it } from "vitest";
import { editionProblemCount, type EditionProblemGuest } from "@/lib/event-problems";
import type { Event, GuestView } from "@/lib/db/schema";
import {
  eventLocation,
  eventNameTranslations,
  makeEvent,
  makeGuestView,
  polishNameCases,
} from "@/test/helpers/fixtures";
import { emptyTemplatesView, type TemplatesView } from "@/lib/templates/fields";
import { templatesViewErrors } from "@/lib/templates/validate";
import { OPTIONAL_NAME_CASE_FIELDS } from "@/lib/name-cases";

function readyEvent(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    name: "Xmas",
    occursOn: "2026-12-24",
    ...eventNameTranslations(),
    ...polishNameCases("Święta"),
    ...eventLocation(),
    budgetKind: "amount",
    budget: 20,
    currency: "EUR",
    budgetEur: 20,
    budgetPln: 85,
    budgetJpy: 3200,
    ...overrides,
  });
}

function completeGuest(overrides: Partial<GuestView> = {}): GuestView {
  return makeGuestView({
    name: "Ada",
    gender: "female",
    phone: null,
    email: null,
    ...polishNameCases("Ada"),
    ...overrides,
  });
}

function problems(
  event: Parameters<typeof editionProblemCount>[0],
  options: {
    templates?: TemplatesView;
    guests?: ReadonlyArray<EditionProblemGuest>;
  } = {},
): number {
  return editionProblemCount(
    event,
    options.templates ?? emptyTemplatesView(),
    options.guests ?? [completeGuest()],
  );
}

function withTemplate(id: "reveal.wishlist_empty" | "email.body", value: string) {
  const view = emptyTemplatesView();
  const language = id === "email.body" ? "en" : "pl";
  view[language][id] = value;
  return view;
}

const TWO_TEMPLATE_ERRORS =
  "{receiver_gender|female:wpisała|male:wpisał|wpisał(a)} {nope}";

describe("editionProblemCount", () => {
  it("is zero when the edition, templates, and guests are complete", () => {
    expect(problems(readyEvent())).toBe(0);
    expect(problems(readyEvent(), { guests: [] })).toBe(0);
  });

  it("counts a guest once when gender and Polish cases are both missing", () => {
    expect(
      problems(readyEvent(), {
        guests: [makeGuestView({ gender: null })],
      }),
    ).toBe(1);
  });

  it("counts a guest with a gender and one missing case", () => {
    expect(
      problems(readyEvent(), {
        guests: [completeGuest({ nameWolacz: null })],
      }),
    ).toBe(1);
  });

  it("counts a guest with cases and no gender", () => {
    expect(
      problems(readyEvent(), {
        guests: [completeGuest({ gender: null })],
      }),
    ).toBe(1);
  });

  it("counts two guests with bad fields as two problems", () => {
    expect(
      problems(readyEvent(), {
        guests: [
          makeGuestView({ id: 1, gender: null }),
          completeGuest({ nameBiernik: "  " }),
        ],
      }),
    ).toBe(2);
  });

  it("counts one template cell once when it has two placeholder errors", () => {
    const templates = withTemplate("reveal.wishlist_empty", TWO_TEMPLATE_ERRORS);
    expect(templatesViewErrors(templates).length).toBeGreaterThan(1);
    expect(problems(readyEvent(), { templates, guests: [] })).toBe(1);
  });

  it("counts two broken template cells as two problems", () => {
    const templates = withTemplate("reveal.wishlist_empty", TWO_TEMPLATE_ERRORS);
    templates.en["email.body"] = "Hi {givre}";
    expect(problems(readyEvent(), { templates, guests: [] })).toBe(2);
  });

  it("ignores blank template copy", () => {
    const templates = emptyTemplatesView();
    templates.en["email.subject"] = "   ";
    expect(problems(readyEvent(), { templates, guests: [] })).toBe(0);
  });

  it("adds a template, a guest, and a settings field", () => {
    const templates = withTemplate("email.body", "Hi {givre}");
    expect(
      problems(readyEvent({ location: null }), {
        templates,
        guests: [completeGuest(), makeGuestView({ id: 2, name: "Bea" })],
      }),
    ).toBe(3);
  });

  it("counts a blank English name and an invalid date", () => {
    expect(problems(readyEvent({ name: "   " }))).toBe(1);
    expect(problems(readyEvent({ occursOn: "2026-02-31" }))).toBe(1);
  });

  it("counts each place field on its own", () => {
    expect(problems(readyEvent({ location: null }))).toBe(1);
    expect(problems(readyEvent({ location: "   " }))).toBe(1);
    expect(problems(readyEvent({ locationGdzie: null }))).toBe(1);
    expect(problems(readyEvent({ locationGdzie: "  " }))).toBe(1);
    expect(
      problems(readyEvent({ location: null, locationGdzie: null })),
    ).toBe(2);
  });

  it("counts each translated name on its own", () => {
    const fields = ["namePl", "nameDe", "nameEs", "nameJa"] as const;
    expect(
      Object.fromEntries(
        fields.map((field) => [field, problems(readyEvent({ [field]: null }))]),
      ),
    ).toEqual({ namePl: 1, nameDe: 1, nameEs: 1, nameJa: 1 });
    expect(problems(readyEvent({ nameDe: "  " }))).toBe(1);
    expect(problems(readyEvent({ namePl: null, nameJa: "" }))).toBe(2);
  });

  it("counts each Polish event-name case on its own", () => {
    expect(
      Object.fromEntries(
        OPTIONAL_NAME_CASE_FIELDS.map(({ field }) => [
          field,
          problems(readyEvent({ [field]: null })),
        ]),
      ),
    ).toEqual({
      nameDopelniacz: 1,
      nameCelownik: 1,
      nameBiernik: 1,
      nameNarzednik: 1,
      nameMiejscownik: 1,
      nameWolacz: 1,
    });
    expect(problems(readyEvent({ nameDopelniacz: "  " }))).toBe(1);
    expect(
      problems(readyEvent({ nameCelownik: null, nameWolacz: null })),
    ).toBe(2);
  });

  it("counts no budget choice once and ignores currency amounts", () => {
    expect(
      problems(
        readyEvent({
          budgetKind: null,
          budget: null,
          budgetEur: 0,
          budgetPln: null,
          budgetJpy: 5,
        }),
      ),
    ).toBe(1);
  });

  it("adds nothing for make-the-gift or no spending limit", () => {
    const stray = {
      budget: 20,
      budgetEur: null,
      budgetPln: 0,
      budgetJpy: null,
    };
    expect(problems(readyEvent({ budgetKind: "zero", ...stray }))).toBe(0);
    expect(problems(readyEvent({ budgetKind: "unlimited", ...stray }))).toBe(0);
  });

  it("counts an empty set-a-budget as the amount plus three currencies", () => {
    expect(
      problems(
        readyEvent({
          budgetKind: "amount",
          budget: null,
          budgetEur: null,
          budgetPln: null,
          budgetJpy: null,
        }),
      ),
    ).toBe(4);
  });

  it("keeps counting currencies when the amount is zero", () => {
    expect(
      problems(
        readyEvent({
          budgetKind: "amount",
          budget: 0,
          currency: "EUR",
          budgetEur: null,
          budgetPln: 0,
          budgetJpy: 10,
        }),
      ),
    ).toBe(3);
    expect(
      problems(
        readyEvent({
          budget: 0,
          currency: "EUR",
          budgetEur: 20,
          budgetPln: 85,
          budgetJpy: 3200,
        }),
      ),
    ).toBe(1);
  });

  it("counts a missing currency and a zero currency as two problems", () => {
    expect(
      problems(
        readyEvent({
          budget: 20,
          currency: "EUR",
          budgetEur: 20,
          budgetPln: null,
          budgetJpy: 0,
        }),
      ),
    ).toBe(2);
  });

  it("counts a positive selected currency that differs from the amount", () => {
    expect(
      problems(
        readyEvent({
          budget: 20,
          currency: "EUR",
          budgetEur: 15,
          budgetPln: 85,
          budgetJpy: 3200,
        }),
      ),
    ).toBe(1);
  });

  it("counts a currency code outside EUR, PLN, and JPY", () => {
    expect(
      problems({
        ...readyEvent(),
        currency: "USD",
      }),
    ).toBe(1);
    expect(problems({ ...readyEvent(), currency: null })).toBe(1);
  });

  it("treats a positive amount saved before budget kinds as set-a-budget", () => {
    expect(
      problems(
        readyEvent({
          budgetKind: null,
          budget: 20,
          currency: "EUR",
          budgetEur: 20,
          budgetPln: 85,
          budgetJpy: 3200,
        }),
      ),
    ).toBe(0);
  });
});
