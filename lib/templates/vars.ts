import {
  budgetShownToGuests,
  effectiveBudgetKind,
  formatBudget,
  type BudgetSnapshot,
} from "@/lib/budget";
import { dateVars } from "@/lib/event-date";
import { locationVars, type EventLocationFields } from "@/lib/event-location";
import { eventVars, type EventNameFields } from "@/lib/event-name";
import { nameVars, type NameCases } from "@/lib/name-cases";
import { budgetSentenceIds, type TemplatesView, type TemplateVars } from "./fields";
import { renderTemplate } from "./render";

/** Amount sentence, or the make-the-gift / no-limit sentence. Empty when unset. */
export function budgetCopy(
  templates: TemplatesView,
  language: string,
  amounts: BudgetSnapshot,
): { budget: string; budgetLine: string; revealLabel: string | null } {
  const kind = effectiveBudgetKind(amounts);
  if (kind === "zero" || kind === "unlimited") {
    const ids = budgetSentenceIds(kind);
    const budgetLine = renderTemplate(templates, ids.email, language);
    const revealLabel = renderTemplate(templates, ids.reveal, language).trim();
    return {
      budget: "",
      budgetLine,
      revealLabel: revealLabel || null,
    };
  }
  if (kind === "amount") {
    const budget = formatBudget(amounts, language) ?? "";
    const budgetLine = budget
      ? renderTemplate(templates, "email.budget_line", language, { budget })
      : "";
    const revealLabel = budget
      ? renderTemplate(templates, "reveal.budget", language, { budget }).trim()
      : "";
    return { budget, budgetLine, revealLabel: revealLabel || null };
  }
  return { budget: "", budgetLine: "", revealLabel: null };
}

export function budgetCopyForGuests(
  templates: TemplatesView,
  language: string,
  draw: BudgetSnapshot,
  event?: BudgetSnapshot | null,
) {
  return budgetCopy(templates, language, budgetShownToGuests(draw, event));
}

export type InvitationVarInput = {
  giver: NameCases;
  event: EventNameFields;
  occursOn: string;
  location: Partial<EventLocationFields> | null;
  url?: string;
  amounts: BudgetSnapshot;
  guestCount: number;
};

/** Giver, event name, and private link — never the receiver. */
export function wishlistNoticeVars(
  language: string,
  giver: NameCases,
  event: EventNameFields,
  url: string,
): TemplateVars {
  return {
    ...nameVars("giver", giver),
    ...eventVars(event, language),
    url,
  };
}

/** Placeholder map shared by invitation mail, Signal, and the template preview. */
export function invitationVars(
  templates: TemplatesView,
  language: string,
  vars: InvitationVarInput,
): TemplateVars {
  const { budget, budgetLine } = budgetCopy(templates, language, vars.amounts);
  return {
    ...nameVars("giver", vars.giver),
    ...eventVars(vars.event, language),
    ...dateVars(vars.occursOn, language),
    ...locationVars(vars.location),
    url: vars.url ?? "",
    budget,
    budget_line: budgetLine,
    guest_count: String(vars.guestCount),
  };
}
