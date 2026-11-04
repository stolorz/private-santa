import { describe, expect, it } from "vitest";
import {
  budgetAmountsEqual,
  budgetChoiceError,
  budgetShownToGuests,
  completeBudgetSnapshot,
  effectiveBudgetKind,
  formatBudget,
  formatBudgetAmount,
  formatCurrencyAmount,
  formatStoredAmount,
  humanizeBudgetAmount,
  isCurrency,
  otherCurrencies,
  parseBudgetAmount,
  preferredBudgetCurrency,
} from "./budget";

describe("isCurrency", () => {
  it("accepts the known codes", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("PLN")).toBe(true);
    expect(isCurrency("JPY")).toBe(true);
    expect(isCurrency("GBP")).toBe(false);
    expect(isCurrency("XXX")).toBe(false);
  });
});

describe("parseBudgetAmount", () => {
  it("accepts whole non-negative integers", () => {
    expect(parseBudgetAmount("0")).toBe(0);
    expect(parseBudgetAmount("100")).toBe(100);
    expect(parseBudgetAmount(" 23 ")).toBe(23);
  });

  it("accepts one or two decimal places", () => {
    expect(parseBudgetAmount("1.1")).toBe(1.1);
    expect(parseBudgetAmount("1.10")).toBe(1.1);
    expect(parseBudgetAmount("0.12")).toBe(0.12);
    expect(parseBudgetAmount("6.80")).toBe(6.8);
  });

  it("rejects empty or invalid input", () => {
    expect(parseBudgetAmount("")).toBeNull();
    expect(parseBudgetAmount("1.123")).toBeNull();
    expect(parseBudgetAmount("-1")).toBeNull();
    expect(parseBudgetAmount("NaN")).toBeNull();
  });

  it("rejects a digit string that overflows to Infinity", () => {
    expect(parseBudgetAmount("1".repeat(400))).toBeNull();
  });
});

describe("humanizeBudgetAmount", () => {
  it("keeps two significant figures at 10 and above", () => {
    expect(humanizeBudgetAmount(1234)).toBe(1200);
    expect(humanizeBudgetAmount(4567)).toBe(4600);
    expect(humanizeBudgetAmount(12345)).toBe(12000);
    expect(humanizeBudgetAmount(999)).toBe(1000);
    expect(humanizeBudgetAmount(23.4)).toBe(23);
  });

  it("rounds [1, 10) to one decimal", () => {
    expect(humanizeBudgetAmount(1.123)).toBe(1.1);
    expect(humanizeBudgetAmount(1.56)).toBe(1.6);
    expect(humanizeBudgetAmount(1.99)).toBe(2);
    expect(humanizeBudgetAmount(3)).toBe(3);
    expect(humanizeBudgetAmount(9.96)).toBe(10);
  });

  it("rounds values below 1 to two decimals", () => {
    expect(humanizeBudgetAmount(0.123)).toBe(0.12);
    expect(humanizeBudgetAmount(0.001)).toBe(0);
    expect(humanizeBudgetAmount(0.6)).toBe(0.6);
    expect(humanizeBudgetAmount(0.996)).toBe(1);
    expect(humanizeBudgetAmount(0)).toBe(0);
  });

  it("rejects non-finite and negative values", () => {
    expect(humanizeBudgetAmount(Number.NaN)).toBeNull();
    expect(humanizeBudgetAmount(-1)).toBeNull();
    expect(humanizeBudgetAmount(Infinity)).toBeNull();
  });
});

describe("formatBudgetAmount", () => {
  it("renders two-sig-fig integers without decimals", () => {
    expect(formatBudgetAmount(1234)).toBe("1200");
    expect(formatBudgetAmount(23.4)).toBe("23");
    expect(formatBudgetAmount(10)).toBe("10");
  });

  it("renders [1, 10) with two decimal places and one non-zero decimal", () => {
    expect(formatBudgetAmount(1.123)).toBe("1.10");
    expect(formatBudgetAmount(1.56)).toBe("1.60");
    expect(formatBudgetAmount(1.99)).toBe("2.00");
    expect(formatBudgetAmount(3)).toBe("3.00");
  });

  it("renders values below 1 with two decimal places", () => {
    expect(formatBudgetAmount(0.123)).toBe("0.12");
    expect(formatBudgetAmount(0.001)).toBe("0.00");
    expect(formatBudgetAmount(0.6)).toBe("0.60");
    expect(formatBudgetAmount(0)).toBe("0.00");
  });

  it("formats using the rounded bucket when rounding crosses a threshold", () => {
    expect(formatBudgetAmount(9.96)).toBe("10");
    expect(formatBudgetAmount(0.996)).toBe("1.00");
  });
});

describe("formatStoredAmount", () => {
  it("keeps the typed integer at 10 and above", () => {
    expect(formatStoredAmount(1234)).toBe("1234");
    expect(formatStoredAmount(10)).toBe("10");
    expect(formatStoredAmount(1200)).toBe("1200");
  });

  it("pads two decimals below 10", () => {
    expect(formatStoredAmount(1.1)).toBe("1.10");
    expect(formatStoredAmount(6.8)).toBe("6.80");
    expect(formatStoredAmount(0)).toBe("0.00");
  });
});

const NBSP = "\u00A0";

describe("formatCurrencyAmount", () => {
  it("puts the Polish mark after the number with a non-breaking space", () => {
    expect(formatCurrencyAmount("100", "PLN", "pl")).toBe(`100${NBSP}zł`);
    expect(formatCurrencyAmount("100", "EUR", "pl")).toBe(`100${NBSP}€`);
    expect(formatCurrencyAmount("100", "JPY", "pl")).toBe(`100${NBSP}¥`);
  });

  it("groups Polish thousands with a non-breaking space", () => {
    expect(formatCurrencyAmount("1000", "JPY", "pl")).toBe(`1${NBSP}000${NBSP}¥`);
    expect(formatCurrencyAmount("1000123", "PLN", "pl")).toBe(
      `1${NBSP}000${NBSP}123${NBSP}zł`,
    );
  });

  it("uses a Polish decimal comma", () => {
    expect(formatCurrencyAmount("3.45", "PLN", "pl")).toBe(`3,45${NBSP}zł`);
  });

  it("puts English euro and yen before the number with no space", () => {
    expect(formatCurrencyAmount("100", "EUR", "en")).toBe("€100");
    expect(formatCurrencyAmount("6.80", "EUR", "en")).toBe("€6.80");
    expect(formatCurrencyAmount("12.12", "JPY", "en")).toBe("¥12.12");
    expect(formatCurrencyAmount("1000000213", "EUR", "en")).toBe(
      "€1,000,000,213",
    );
  });

  it("puts the English złoty code before the number with a non-breaking space", () => {
    expect(formatCurrencyAmount("100", "PLN", "en")).toBe(`PLN${NBSP}100`);
    expect(formatCurrencyAmount("1000.50", "PLN", "en")).toBe(
      `PLN${NBSP}1,000.50`,
    );
  });

  it("puts Japanese yen after the number as 円 and PLN after the number", () => {
    expect(formatCurrencyAmount("120", "PLN", "ja")).toBe(`120${NBSP}PLN`);
    expect(formatCurrencyAmount("1000", "PLN", "ja")).toBe(`1,000${NBSP}PLN`);
    expect(formatCurrencyAmount("20", "EUR", "ja")).toBe("€20");
    expect(formatCurrencyAmount("1000000213", "EUR", "ja")).toBe(
      "€1,000,000,213",
    );
    expect(formatCurrencyAmount("1200", "JPY", "ja")).toBe("1,200円");
    expect(formatCurrencyAmount("12.12", "JPY", "ja")).toBe("12.12円");
  });

  it("puts the German mark after the number with a non-breaking space", () => {
    expect(formatCurrencyAmount("100", "EUR", "de")).toBe(`100${NBSP}€`);
    expect(formatCurrencyAmount("100", "PLN", "de")).toBe(`100${NBSP}PLN`);
    expect(formatCurrencyAmount("100", "JPY", "de")).toBe(`100${NBSP}¥`);
  });

  it("uses a German thousands dot and decimal comma", () => {
    expect(formatCurrencyAmount("1000.00", "PLN", "de")).toBe(
      `1.000,00${NBSP}PLN`,
    );
    expect(formatCurrencyAmount("1000000213", "EUR", "de")).toBe(
      `1.000.000.213${NBSP}€`,
    );
    expect(formatCurrencyAmount("12.12", "JPY", "de")).toBe(`12,12${NBSP}¥`);
  });

  it("uses Spanish grouping spaces and a decimal comma", () => {
    expect(formatCurrencyAmount("1000.00", "PLN", "es")).toBe(
      `1${NBSP}000,00${NBSP}PLN`,
    );
    expect(formatCurrencyAmount("1000000213", "EUR", "es")).toBe(
      `1${NBSP}000${NBSP}000${NBSP}213${NBSP}€`,
    );
    expect(formatCurrencyAmount("12.12", "JPY", "es")).toBe(`12,12${NBSP}¥`);
  });

  it("uses English when the language is missing or unknown", () => {
    expect(formatCurrencyAmount("100", "PLN")).toBe(`PLN${NBSP}100`);
    expect(formatCurrencyAmount("100", "EUR", null)).toBe("€100");
    expect(formatCurrencyAmount("12.12", "JPY", "fr")).toBe("¥12.12");
  });
});

describe("budgetAmountsEqual", () => {
  it("treats equivalent display amounts as equal", () => {
    expect(budgetAmountsEqual(1.1, 1.1)).toBe(true);
    expect(budgetAmountsEqual(6.8, 6.8)).toBe(true);
    expect(budgetAmountsEqual(1.1, 1.2)).toBe(false);
  });
});

describe("otherCurrencies", () => {
  it("returns the two non-primary codes", () => {
    expect(otherCurrencies("PLN")).toEqual(["EUR", "JPY"]);
    expect(otherCurrencies("EUR")).toEqual(["PLN", "JPY"]);
  });
});

describe("preferredBudgetCurrency", () => {
  it("maps guest language to a display currency", () => {
    expect(preferredBudgetCurrency("pl")).toBe("PLN");
    expect(preferredBudgetCurrency("ja")).toBe("JPY");
    expect(preferredBudgetCurrency("en")).toBe("EUR");
    expect(preferredBudgetCurrency("de")).toBe("EUR");
    expect(preferredBudgetCurrency("es")).toBe("EUR");
  });
});

describe("formatBudgetAmount / formatStoredAmount", () => {
  it("returns null for non-finite or negative values", () => {
    expect(formatBudgetAmount(-1)).toBeNull();
    expect(formatBudgetAmount(Number.NaN)).toBeNull();
    expect(formatStoredAmount(-1)).toBeNull();
    expect(formatStoredAmount(Number.NaN)).toBeNull();
  });
});

describe("formatBudget", () => {
  const amounts = {
    budget: 100,
    currency: "PLN",
    budgetEur: 23,
    budgetPln: 100,
    budgetJpy: 4000,
  };

  it("returns null when there is no amount", () => {
    expect(formatBudget({ budget: null, currency: "EUR" })).toBeNull();
    expect(formatBudget({ budget: undefined, currency: "PLN" })).toBeNull();
    expect(formatBudget({ budget: Number.NaN, currency: "PLN" })).toBeNull();
    expect(formatBudget({ budget: Infinity, currency: "EUR" })).toBeNull();
  });

  it("formats the primary amount with a known currency", () => {
    expect(formatBudget({ budget: 20, currency: "PLN" })).toBe(`PLN${NBSP}20`);
    expect(formatBudget({ budget: 0, currency: "EUR" })).toBe("€0.00");
    expect(formatBudget({ budget: 1.1, currency: "EUR" })).toBe("€1.10");
    expect(formatBudget({ budget: 1234, currency: "PLN" })).toBe(
      `PLN${NBSP}1,234`,
    );
    expect(formatBudget({ budget: 3.45, currency: "PLN" }, "pl")).toBe(
      `3,45${NBSP}zł`,
    );
    expect(formatBudget({ budget: 1000.5, currency: "PLN" }, "en")).toBe(
      `PLN${NBSP}1,000.50`,
    );
    expect(formatBudget({ budget: 1200, currency: "JPY" }, "ja")).toBe(
      "1,200円",
    );
  });

  it("falls back to euro when currency is missing or unknown", () => {
    expect(formatBudget({ budget: 25, currency: null })).toBe("€25");
    expect(formatBudget({ budget: 25, currency: "XXX" })).toBe("€25");
  });

  it("adds the guest preferred equivalent in the template language", () => {
    expect(formatBudget(amounts, "en")).toBe(`PLN${NBSP}100 (€23)`);
    expect(formatBudget(amounts, "de")).toBe(`100${NBSP}PLN (23${NBSP}€)`);
    expect(formatBudget(amounts, "es")).toBe(`100${NBSP}PLN (23${NBSP}€)`);
    expect(formatBudget(amounts, "ja")).toBe(`100${NBSP}PLN (約4,000円)`);
    expect(
      formatBudget({ budget: 1200, currency: "JPY", budgetEur: 6.8 }, "en"),
    ).toBe("¥1,200 (€6.80)");
    expect(
      formatBudget({ budget: 1200, currency: "JPY", budgetPln: 30 }, "pl"),
    ).toBe(`1${NBSP}200${NBSP}¥ (30${NBSP}zł)`);
  });

  it("omits the parenthetical when preferred matches the primary", () => {
    expect(formatBudget(amounts, "pl")).toBe(`100${NBSP}zł`);
  });

  it("formats a Japanese converted amount with 約 and suffix 円", () => {
    expect(
      formatBudget(
        {
          budget: 120,
          currency: "PLN",
          budgetEur: 27,
          budgetPln: 120,
          budgetJpy: 4800,
        },
        "ja",
      ),
    ).toBe(`120${NBSP}PLN (約4,800円)`);
    expect(
      formatBudget({ budget: 40, currency: "PLN" }, "ja"),
    ).toBe(`40${NBSP}PLN`);
  });

  it("omits the parenthetical when extras are missing or invalid", () => {
    expect(formatBudget({ budget: 40, currency: "PLN" }, "en")).toBe(
      `PLN${NBSP}40`,
    );
    expect(formatBudget({ ...amounts, budgetEur: Number.NaN }, "en")).toBe(
      `PLN${NBSP}100`,
    );
    expect(formatBudget({ ...amounts, budgetEur: Infinity }, "en")).toBe(
      `PLN${NBSP}100`,
    );
    expect(formatBudget({ ...amounts, budgetEur: -1 }, "en")).toBe(
      `PLN${NBSP}100`,
    );
  });

  it("formats every primary currency for every guest language", () => {
    const eur = {
      budget: 20,
      currency: "EUR",
      budgetEur: 20,
      budgetPln: 80,
      budgetJpy: 3000,
    };
    const jpy = {
      budget: 1200,
      currency: "JPY",
      budgetEur: 6.8,
      budgetPln: 30,
      budgetJpy: 1200,
    };
    expect(formatBudget(eur, "en")).toBe("€20");
    expect(formatBudget(eur, "de")).toBe(`20${NBSP}€`);
    expect(formatBudget(eur, "es")).toBe(`20${NBSP}€`);
    expect(formatBudget(eur, "pl")).toBe(`20${NBSP}€ (80${NBSP}zł)`);
    expect(formatBudget(eur, "ja")).toBe("€20 (約3,000円)");
    expect(formatBudget(jpy, "ja")).toBe("1,200円");
    expect(formatBudget(jpy, "en")).toBe("¥1,200 (€6.80)");
    expect(formatBudget(jpy, "de")).toBe(`1.200${NBSP}¥ (6,80${NBSP}€)`);
    expect(formatBudget(jpy, "es")).toBe(
      `1${NBSP}200${NBSP}¥ (6,80${NBSP}€)`,
    );
    expect(formatBudget(jpy, "pl")).toBe(`1${NBSP}200${NBSP}¥ (30${NBSP}zł)`);
    expect(formatBudget(amounts, null)).toBe(`PLN${NBSP}100 (€23)`);
    expect(formatBudget(amounts, undefined)).toBe(`PLN${NBSP}100 (€23)`);
    expect(formatBudget({ budget: -5, currency: "EUR" })).toBeNull();
  });
});

describe("completeBudgetSnapshot", () => {
  const event = {
    budget: 120,
    currency: "PLN",
    budgetEur: 27,
    budgetPln: 120,
    budgetJpy: 4800,
  };

  it("fills missing extras from a matching event", () => {
    expect(
      formatBudget(
        completeBudgetSnapshot({ budget: 120, currency: "PLN" }, event),
        "en",
      ),
      ).toBe(`PLN${NBSP}120 (€27)`);
  });

  it("does not use extras when the main amount changed", () => {
    expect(
      formatBudget(
        completeBudgetSnapshot({ budget: 120, currency: "PLN" }, {
          ...event,
          budget: 150,
          budgetPln: 150,
        }),
        "en",
      ),
    ).toBe(`PLN${NBSP}120`);
  });

  it("does nothing when the draw amount is null", () => {
    const draw = { budget: null, currency: "PLN" };
    expect(completeBudgetSnapshot(draw, event)).toBe(draw);
  });

  it("does nothing when the currency does not match", () => {
    const draw = { budget: 120, currency: "EUR" };
    expect(completeBudgetSnapshot(draw, event)).toBe(draw);
  });

  it("does nothing without a fallback", () => {
    const draw = { budget: 120, currency: "PLN" };
    expect(completeBudgetSnapshot(draw)).toBe(draw);
    expect(completeBudgetSnapshot(draw, null)).toBe(draw);
  });

  it("keeps an already complete snapshot and fills only the missing extras", () => {
    const complete = {
      budget: 120,
      currency: "PLN",
      budgetEur: 1,
      budgetPln: 2,
      budgetJpy: 3,
    };
    expect(completeBudgetSnapshot(complete, event)).toBe(complete);
    expect(
      completeBudgetSnapshot(
        { budget: 120, currency: "PLN", budgetEur: 9 },
        event,
      ),
    ).toEqual({
      budget: 120,
      currency: "PLN",
      budgetEur: 9,
      budgetPln: 120,
      budgetJpy: 4800,
    });
  });
});

describe("budget choice", () => {
  const amount = {
    budgetKind: "amount",
    budget: 20,
    currency: "EUR",
    budgetEur: 20,
    budgetPln: 80,
    budgetJpy: 3000,
  };

  it("treats a positive amount without a kind as a budget", () => {
    expect(effectiveBudgetKind({ budget: 20, currency: "EUR" })).toBe("amount");
    expect(effectiveBudgetKind({ budget: 0, currency: "EUR" })).toBeNull();
    expect(effectiveBudgetKind({ budget: null })).toBeNull();
    expect(effectiveBudgetKind({ budgetKind: "zero", budget: null })).toBe("zero");
  });

  it("uses the draw when it already has a choice", () => {
    expect(
      budgetShownToGuests(
        { budgetKind: "amount", budget: 10, currency: "EUR", budgetEur: 10, budgetPln: 40, budgetJpy: 1600 },
        amount,
      ),
    ).toMatchObject({ budgetKind: "amount", budget: 10 });
    expect(
      budgetShownToGuests({ budgetKind: "unlimited", budget: null }, amount),
    ).toMatchObject({ budgetKind: "unlimited", budget: null });
  });

  it("uses the edition when the draw has no choice", () => {
    expect(
      budgetShownToGuests({ budget: null, budgetKind: null }, amount),
    ).toMatchObject({ budgetKind: "amount", budget: 20 });
    expect(
      budgetShownToGuests(
        { budget: null },
        { budgetKind: "zero", budget: null },
      ),
    ).toMatchObject({ budgetKind: "zero", budget: null });
  });

  it("rejects an unset, zero, or inconsistent amount", () => {
    expect(budgetChoiceError({ budgetKind: null })).toMatch(/Choose a budget/);
    expect(
      budgetChoiceError({
        budgetKind: "amount",
        budget: 0,
        currency: "EUR",
        budgetEur: 0,
        budgetPln: 0,
        budgetJpy: 0,
      }),
    ).toMatch(/make-the-gift/);
    expect(budgetChoiceError({ budgetKind: "zero", budget: null })).toBeNull();
    expect(
      budgetChoiceError({ budgetKind: "unlimited", budget: 10 }),
    ).toMatch(/Clear all budget amounts/);
    expect(budgetChoiceError(amount)).toBeNull();
    expect(
      budgetChoiceError({ budgetKind: "amount", budget: null }),
    ).toBe("Enter a budget amount.");
    expect(
      budgetChoiceError({ budgetKind: "amount", budget: Number.NaN }),
    ).toBe("Enter a budget amount.");
    expect(
      budgetChoiceError({
        budgetKind: "amount",
        budget: 20,
        currency: "XXX",
        budgetEur: 20,
        budgetPln: 80,
        budgetJpy: 3000,
      }),
    ).toBe("Currency is required when setting a budget.");
    expect(
      budgetChoiceError({
        budgetKind: "amount",
        budget: 20,
        currency: "EUR",
        budgetEur: 21,
        budgetPln: 80,
        budgetJpy: 3000,
      }),
    ).toBe("Primary budget must match its currency amount.");
    expect(
      budgetChoiceError({
        budgetKind: "amount",
        budget: 20,
        currency: "EUR",
        budgetEur: 20,
      }),
    ).toBe("EUR, PLN, and JPY amounts are required.");
  });
});
