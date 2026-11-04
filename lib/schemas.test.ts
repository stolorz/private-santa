import { describe, expect, it } from "vitest";
import { polishNameCases } from "@/test/helpers/fixtures";
import {
  contactSchema,
  eventPatchSchema,
  personFieldsSchema,
  templatesPatchSchema,
} from "@/lib/schemas";

describe("eventPatchSchema", () => {
  it("requires extras to arrive with the primary budget", () => {
    const parsed = eventPatchSchema.safeParse({ budgetEur: 10 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/together/);
    }
  });

  it("refuses leftover extras when clearing the budget", () => {
    for (const extra of [
      { budgetEur: 10 },
      { budgetPln: 10 },
      { budgetJpy: 10 },
    ]) {
      const parsed = eventPatchSchema.safeParse({ budget: null, ...extra });
      expect(parsed.success).toBe(false);
    }
  });

  it("requires currency when setting a budget", () => {
    const parsed = eventPatchSchema.safeParse({
      budget: 20,
      budgetEur: 20,
      budgetPln: 80,
      budgetJpy: 3000,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/Currency is required/);
    }
  });

  it("requires EUR, PLN, and JPY amounts", () => {
    const parsed = eventPatchSchema.safeParse({
      budget: 20,
      currency: "EUR",
      budgetEur: 20,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/EUR, PLN, and JPY/);
    }
  });

  it("requires the primary amount to match its currency extra", () => {
    const parsed = eventPatchSchema.safeParse({
      budget: 20,
      currency: "EUR",
      budgetEur: 21,
      budgetPln: 80,
      budgetJpy: 3000,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/must match/);
    }
  });

  it("rejects a zero amount", () => {
    const parsed = eventPatchSchema.safeParse({
      budgetKind: "amount",
      budget: 0,
      currency: "EUR",
      budgetEur: 0,
      budgetPln: 0,
      budgetJpy: 0,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/make-the-gift/);
    }
  });

  it("accepts make-the-gift and no-limit without amounts", () => {
    expect(eventPatchSchema.parse({ budgetKind: "zero" })).toEqual({
      budgetKind: "zero",
    });
    expect(
      eventPatchSchema.parse({
        budgetKind: "unlimited",
        budget: null,
        budgetEur: null,
        budgetPln: null,
        budgetJpy: null,
      }),
    ).toMatchObject({ budgetKind: "unlimited", budget: null });
  });

  it("rejects an amount on make-the-gift and a leftover extra", () => {
    const amount = eventPatchSchema.safeParse({
      budgetKind: "zero",
      budget: 5,
    });
    expect(amount.success).toBe(false);
    if (!amount.success) {
      expect(amount.error.issues[0]?.message).toMatch(/Clear the budget amount/);
    }
    const extra = eventPatchSchema.safeParse({
      budgetKind: "unlimited",
      budget: null,
      budgetEur: 1,
      budgetPln: 1,
      budgetJpy: 1,
    });
    expect(extra.success).toBe(false);
    if (!extra.success) {
      expect(extra.error.issues.some((issue) => /together/.test(issue.message))).toBe(
        true,
      );
    }
  });

  it("requires an amount when the choice is a budget", () => {
    for (const body of [
      { budgetKind: "amount" as const },
      { budgetKind: "amount" as const, budget: null },
    ]) {
      const parsed = eventPatchSchema.safeParse(body);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toBe("Enter a budget amount.");
      }
    }
  });

  it("rejects clearing the choice", () => {
    const parsed = eventPatchSchema.safeParse({ budgetKind: null });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/Choose a budget/);
    }
  });

  it("accepts a complete budget patch", () => {
    const parsed = eventPatchSchema.safeParse({
      name: "Xmas",
      budget: 20,
      currency: "EUR",
      budgetEur: 20,
      budgetPln: 80,
      budgetJpy: 3000,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a name-only patch", () => {
    expect(eventPatchSchema.parse({ name: "Office" })).toEqual({ name: "Office" });
  });

  it("accepts a real party date", () => {
    expect(eventPatchSchema.parse({ occursOn: "2026-12-24" })).toEqual({
      occursOn: "2026-12-24",
    });
  });

  it("refuses a blank party date", () => {
    const message =
      "Enter the event date. Guest messages will include it, so these details cannot be saved without one.";
    for (const occursOn of ["", "   ", null]) {
      const parsed = eventPatchSchema.safeParse({ occursOn });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toBe(message);
      }
    }
  });

  it("rejects an impossible party date with the format message", () => {
    const parsed = eventPatchSchema.safeParse({ occursOn: "2026-13-01" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("Date must be YYYY-MM-DD.");
    }
  });
});

describe("contactSchema", () => {
  it("normalizes a phone and rejects invalid digits", () => {
    expect(contactSchema.parse({ phone: "351911111111" }).phone).toBe(
      "351911111111",
    );
    expect(contactSchema.safeParse({ phone: "abc" }).success).toBe(false);
    expect(contactSchema.parse({ phone: "" }).phone).toBeNull();
    expect(contactSchema.parse({}).phone).toBeUndefined();
  });

  it("normalizes email and rejects invalid addresses", () => {
    expect(contactSchema.parse({ email: " Ada@Example.COM " }).email).toBe(
      "ada@example.com",
    );
    expect(contactSchema.parse({ email: "" }).email).toBeNull();
    expect(contactSchema.safeParse({ email: "not-an-email" }).success).toBe(
      false,
    );
  });
});

describe("personFieldsSchema", () => {
  it("accepts a person once every Polish case is present", () => {
    expect(
      personFieldsSchema.parse({
        name: "Ada",
        language: "pl",
        gender: "female",
        ...polishNameCases("Ada"),
      }),
    ).toMatchObject({ name: "Ada", language: "pl", gender: "female" });
  });

  it("accepts only female or male", () => {
    for (const gender of ["female", "male"] as const) {
      expect(
        personFieldsSchema.parse({
          name: "Ada",
          gender,
          ...polishNameCases("Ada"),
        }).gender,
      ).toBe(gender);
    }
    for (const body of [
      { name: "Ada", ...polishNameCases("Ada") },
      { name: "Ada", gender: null, ...polishNameCases("Ada") },
      { name: "Ada", gender: "nope", ...polishNameCases("Ada") },
      { name: "Ada", gender: "", ...polishNameCases("Ada") },
    ]) {
      const parsed = personFieldsSchema.safeParse(body);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.code).toBe("custom");
        expect(parsed.error.issues[0]?.message).toBe("Gender is required.");
      }
    }
  });

  it("refuses a save that leaves a Polish case blank", () => {
    const parsed = personFieldsSchema.safeParse({
      name: "Ada",
      gender: "female",
      ...polishNameCases("Ada"),
      nameWolacz: " ",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Enter the missing Polish cases: Wołacz.",
      );
    }
  });
});

describe("templatesPatchSchema", () => {
  it("keeps only known template ids per language", () => {
    const parsed = templatesPatchSchema.parse({
      en: { "email.body": "Hello {giver}" },
      pl: {},
    });
    expect(parsed.en).toEqual({ "email.body": "Hello {giver}" });
    expect(parsed.pl).toEqual({});
    expect(parsed.de).toBeUndefined();
  });
});
