export const CURRENCIES = ["EUR", "PLN", "JPY"] as const;

export type Currency = (typeof CURRENCIES)[number];

/** How an edition spends. Null in the database means the organiser has not chosen. */
export const BUDGET_KINDS = ["amount", "zero", "unlimited"] as const;

export type BudgetKind = (typeof BUDGET_KINDS)[number];

export const MISSING_BUDGET_CHOICE_MESSAGE =
  "Choose a budget, make-the-gift, or no spending limit.";

export const ZERO_IS_NOT_A_BUDGET_MESSAGE =
  "Zero is not a budget amount. Choose make-the-gift if guests should not spend money.";

export const BUDGET_AMOUNT_REQUIRED_MESSAGE = "Enter a budget amount.";

export type BudgetSnapshot = {
  budget?: number | null;
  currency?: string | null;
  budgetEur?: number | null;
  budgetPln?: number | null;
  budgetJpy?: number | null;
  budgetKind?: string | null;
};

export function isBudgetKind(value: unknown): value is BudgetKind {
  return (
    typeof value === "string" &&
    (BUDGET_KINDS as readonly string[]).includes(value)
  );
}

/** Stored kind, or `amount` when a positive number was saved before kinds existed. */
export function effectiveBudgetKind(
  snapshot: BudgetSnapshot | null | undefined,
): BudgetKind | null {
  if (isBudgetKind(snapshot?.budgetKind)) return snapshot.budgetKind;
  const amount = finiteAmount(snapshot?.budget);
  return amount != null && amount > 0 ? "amount" : null;
}

/**
 * What guests should see. A draw that already has a choice wins. An unset
 * draw uses the edition, so a choice saved after the pairs were made still
 * reaches invitations.
 */
export function budgetShownToGuests(
  draw: BudgetSnapshot,
  event?: BudgetSnapshot | null,
): BudgetSnapshot {
  if (hasBudgetChoice(draw)) {
    if (effectiveBudgetKind(draw) === "amount") {
      return { ...completeBudgetSnapshot(draw, event), budgetKind: "amount" };
    }
    return { ...draw, budgetKind: effectiveBudgetKind(draw) };
  }
  if (event && hasBudgetChoice(event)) {
    const kind = effectiveBudgetKind(event);
    if (kind === "amount") return { ...event, budgetKind: "amount" };
    return {
      ...event,
      budgetKind: kind,
      budget: null,
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    };
  }
  return { ...draw, budgetKind: null };
}

export function hasBudgetChoice(
  snapshot: BudgetSnapshot | null | undefined,
): boolean {
  return effectiveBudgetKind(snapshot) != null;
}

/**
 * Why a merged edition budget cannot be stored. `null` when the choice is
 * explicit and consistent.
 */
export function budgetChoiceError(choice: BudgetSnapshot): string | null {
  const kind = choice.budgetKind;
  if (!isBudgetKind(kind)) return MISSING_BUDGET_CHOICE_MESSAGE;
  if (kind === "zero" || kind === "unlimited") {
    if (
      choice.budget != null ||
      choice.budgetEur != null ||
      choice.budgetPln != null ||
      choice.budgetJpy != null
    ) {
      return "Clear all budget amounts together.";
    }
    return null;
  }
  if (choice.budget === 0) return ZERO_IS_NOT_A_BUDGET_MESSAGE;
  if (typeof choice.budget !== "number" || !(choice.budget > 0)) {
    return BUDGET_AMOUNT_REQUIRED_MESSAGE;
  }
  if (!choice.currency || !isCurrency(choice.currency)) {
    return "Currency is required when setting a budget.";
  }
  if (
    choice.budgetEur == null ||
    choice.budgetPln == null ||
    choice.budgetJpy == null
  ) {
    return "EUR, PLN, and JPY amounts are required.";
  }
  const extras = {
    EUR: choice.budgetEur,
    PLN: choice.budgetPln,
    JPY: choice.budgetJpy,
  };
  if (!budgetAmountsEqual(extras[choice.currency], choice.budget)) {
    return "Primary budget must match its currency amount.";
  }
  return null;
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** Non-negative amount from a form field, optional 1–2 decimal places. */
export function parseBudgetAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function otherCurrencies(primary: Currency): Currency[] {
  return CURRENCIES.filter((code) => code !== primary);
}

/** Guest language → the amount they should see in parentheses. */
export function preferredBudgetCurrency(language?: string | null): Currency {
  if (language === "pl") return "PLN";
  if (language === "ja") return "JPY";
  return "EUR";
}

function finiteAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Family-budget rounding: two significant figures at 10+, one decimal in
 * [1, 10), two decimals below 1.
 */
export function humanizeBudgetAmount(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value === 0) return 0;
  if (value >= 10) {
    const magnitude = Math.floor(Math.log10(value));
    const scale = 10 ** (magnitude - 1);
    return Math.round(value / scale) * scale;
  }
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/** Display form of a humanized extra: `1200`, `1.10`, `0.12`. */
export function formatBudgetAmount(value: number): string | null {
  const n = humanizeBudgetAmount(value);
  if (n == null) return null;
  return formatStoredAmount(n);
}

/** Typed/stored amount without two-significant-figure rounding. */
export function formatStoredAmount(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return value >= 10 && Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const NBSP = "\u00A0";

type CurrencyStyle = {
  group: string;
  decimal: string;
  prefix: boolean;
};

function currencyStyle(language?: string | null): CurrencyStyle {
  if (language === "pl" || language === "es") {
    return { group: NBSP, decimal: ",", prefix: false };
  }
  if (language === "de") return { group: ".", decimal: ",", prefix: false };
  return { group: ",", decimal: ".", prefix: true };
}

function groupThousands(integer: string, separator: string): string {
  if (integer.length <= 3) return integer;
  const parts: string[] = [];
  let end = integer.length;
  while (end > 3) {
    parts.unshift(integer.slice(end - 3, end));
    end -= 3;
  }
  parts.unshift(integer.slice(0, end));
  return parts.join(separator);
}

/** Canonical `1234` / `6.80` → grouped digits with the language's decimal mark. */
function formatCanonicalAmount(
  amount: string,
  group: string,
  decimal: string,
): string {
  const [integer, fraction] = amount.split(".");
  const grouped = groupThousands(integer, group);
  return fraction == null ? grouped : `${grouped}${decimal}${fraction}`;
}

function currencyMark(code: Currency, language?: string | null): string {
  if (code === "EUR") return "€";
  if (code === "JPY") return language === "ja" ? "円" : "¥";
  return language === "pl" ? "zł" : "PLN";
}

/**
 * Guest-facing amount: grouping, decimal mark, and unit placement follow
 * the template language. Missing or unknown language uses English.
 * Japanese puts yen after the number as `円`, PLN after the number, and
 * keeps the euro prefix.
 */
export function formatCurrencyAmount(
  amount: string,
  code: Currency,
  language?: string | null,
): string {
  const style = currencyStyle(language);
  const number = formatCanonicalAmount(amount, style.group, style.decimal);
  const mark = currencyMark(code, language);
  if (language === "ja") {
    if (code === "JPY") return `${number}${mark}`;
    if (code === "PLN") return `${number}${NBSP}${mark}`;
    return `${mark}${number}`;
  }
  if (style.prefix) {
    return code === "PLN" ? `${mark}${NBSP}${number}` : `${mark}${number}`;
  }
  return `${number}${NBSP}${mark}`;
}

export function budgetAmountsEqual(a: number, b: number): boolean {
  return formatBudgetAmount(a) === formatBudgetAmount(b);
}

function extraAmount(snapshot: BudgetSnapshot, code: Currency): number | null {
  if (code === "EUR") return finiteAmount(snapshot.budgetEur);
  if (code === "PLN") return finiteAmount(snapshot.budgetPln);
  return finiteAmount(snapshot.budgetJpy);
}

function snapshotCurrency(snapshot: BudgetSnapshot): Currency {
  return snapshot.currency && isCurrency(snapshot.currency)
    ? snapshot.currency
    : "EUR";
}

function extrasComplete(snapshot: BudgetSnapshot): boolean {
  return CURRENCIES.every((code) => extraAmount(snapshot, code) != null);
}

/**
 * Draws taken before extras existed have a primary amount and null
 * EUR/PLN/JPY columns. Fill those from the live event when the typed
 * main budget is unchanged.
 */
export function completeBudgetSnapshot(
  snapshot: BudgetSnapshot,
  fallback?: BudgetSnapshot | null,
): BudgetSnapshot {
  if (!fallback || extrasComplete(snapshot)) return snapshot;
  if (
    finiteAmount(snapshot.budget) == null ||
    snapshot.budget !== fallback.budget ||
    snapshotCurrency(snapshot) !== snapshotCurrency(fallback)
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    budgetEur: extraAmount(snapshot, "EUR") ?? extraAmount(fallback, "EUR"),
    budgetPln: extraAmount(snapshot, "PLN") ?? extraAmount(fallback, "PLN"),
    budgetJpy: extraAmount(snapshot, "JPY") ?? extraAmount(fallback, "JPY"),
  };
}

/**
 * `100 zł`, `PLN 100 (€23)`, or Japanese `100 PLN (約4,000円)`.
 * Null when there is no amount. Never stringifies non-finite values.
 * Both amounts use `language`. Japanese prefixes a converted yen amount
 * with `約`.
 */
export function formatBudget(
  snapshot: BudgetSnapshot,
  language?: string | null,
): string | null {
  const amount = finiteAmount(snapshot.budget);
  const formatted = amount != null ? formatStoredAmount(amount) : null;
  if (formatted == null) return null;
  const code = snapshotCurrency(snapshot);
  const primary = formatCurrencyAmount(formatted, code, language);
  const preferred = preferredBudgetCurrency(language);
  if (preferred === code) return primary;
  const extra = extraAmount(snapshot, preferred);
  const extraFormatted = extra != null ? formatBudgetAmount(extra) : null;
  if (extraFormatted == null) return primary;
  const converted = formatCurrencyAmount(extraFormatted, preferred, language);
  if (language === "ja") return `${primary} (約${converted})`;
  return `${primary} (${converted})`;
}
