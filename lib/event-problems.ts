import {
  CURRENCIES,
  effectiveBudgetKind,
  isCurrency,
  type BudgetSnapshot,
  type Currency,
} from "@/lib/budget";
import type { EventLocationFields } from "@/lib/event-location";
import {
  missingEventTranslations,
  type EventNameFields,
} from "@/lib/event-name";
import { isGender } from "@/lib/gender";
import { missingNameCases, type OptionalNameCaseField } from "@/lib/name-cases";
import { isValidOccursOn } from "@/lib/occurs-on";
import type { TemplatesView } from "@/lib/templates/fields";
import {
  invalidTemplateCount,
  templatesViewErrors,
} from "@/lib/templates/validate";

/** Edition fields the event list can score without loading guests or templates. */
export type EditionProblemSource = EventNameFields &
  EventLocationFields &
  BudgetSnapshot & { occursOn: string };

/** Seat fields that make one guest a single problem. */
export type EditionProblemGuest = {
  gender: string | null;
} & Partial<Record<OptionalNameCaseField, string | null | undefined>>;

function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function storedCurrencyAmount(
  event: EditionProblemSource,
  code: Currency,
): number | null | undefined {
  if (code === "EUR") return event.budgetEur;
  if (code === "PLN") return event.budgetPln;
  return event.budgetJpy;
}

/**
 * Budget problems for one edition.
 * No choice is one problem and ignores amounts. Make-the-gift and no
 * spending limit add none. Set a budget scores the amount and each currency
 * on its own.
 */
function budgetProblemCount(event: EditionProblemSource): number {
  const kind = effectiveBudgetKind(event);
  if (kind == null) return 1;
  if (kind !== "amount") return 0;

  let count = 0;
  const amount = event.budget;
  if (!isPositiveAmount(amount)) count += 1;
  const currency = event.currency ?? "";
  if (!isCurrency(currency)) count += 1;

  for (const code of CURRENCIES) {
    const stored = storedCurrencyAmount(event, code);
    if (!isPositiveAmount(stored)) {
      count += 1;
      continue;
    }
    // A positive selected-currency amount that is a different number from
    // the amount is its own problem. A missing or non-positive amount is
    // not also a mismatch.
    if (
      currency === code &&
      isPositiveAmount(amount) &&
      stored !== amount
    ) {
      count += 1;
    }
  }
  return count;
}

function settingsProblemCount(event: EditionProblemSource): number {
  let count = 0;
  if (event.name.trim() === "") count += 1;
  if (!isValidOccursOn(event.occursOn)) count += 1;
  if (!(event.location?.trim() ?? "")) count += 1;
  if (!(event.locationGdzie?.trim() ?? "")) count += 1;
  count += missingEventTranslations(event).length;
  count += missingNameCases(event).length;
  count += budgetProblemCount(event);
  return count;
}

function guestHasProblem(guest: EditionProblemGuest): boolean {
  return !isGender(guest.gender ?? "") || missingNameCases(guest).length > 0;
}

/**
 * Problems on one edition: invalid template cells, seated guests with a
 * missing or invalid field, and Event settings inputs that are blank or
 * invalid. A guest with several bad fields still counts once. Two broken
 * tokens in one template cell still count once.
 */
export function editionProblemCount(
  event: EditionProblemSource,
  templates: TemplatesView,
  guests: ReadonlyArray<EditionProblemGuest>,
): number {
  return (
    invalidTemplateCount(templatesViewErrors(templates)) +
    guests.filter(guestHasProblem).length +
    settingsProblemCount(event)
  );
}
