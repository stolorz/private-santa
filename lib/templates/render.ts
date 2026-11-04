import {
  resolveTemplateLanguage,
  type TemplateId,
  type TemplatesView,
  type TemplateVars,
} from "./fields";
import { interpolate } from "./parse";

export function renderTemplate(
  view: TemplatesView,
  id: TemplateId,
  language: string,
  vars: TemplateVars = {},
): string {
  const lang = resolveTemplateLanguage(language);
  return interpolate(view[lang][id] ?? "", vars, lang);
}

export type RevealCopy = {
  greeting: string;
  readyDescription: string;
  unwrapButton: string;
  unwrapping: string;
  revealedTitle: string;
  revealedName: string;
  budgetLabel: string;
  wishlistHeading: string;
  wishlistEmpty: string;
  ownWishlistTitle: string;
  ownWishlistDescription: string;
  previousTitle: string;
  previousDescription: string;
  previousRow: string;
  notFoundTitle: string;
  notFoundDescription: string;
  unwrapError: string;
};

export function revealCopy(
  view: TemplatesView,
  language: string,
  vars: TemplateVars = {},
): RevealCopy {
  const t = (id: TemplateId) => renderTemplate(view, id, language, vars);
  return {
    greeting: t("reveal.greeting"),
    readyDescription: t("reveal.ready_description"),
    unwrapButton: t("reveal.unwrap_button"),
    unwrapping: t("reveal.unwrapping"),
    revealedTitle: t("reveal.revealed_title"),
    revealedName: t("reveal.revealed_name"),
    budgetLabel: t("reveal.budget"),
    wishlistHeading: t("reveal.wishlist_heading"),
    wishlistEmpty: t("reveal.wishlist_empty"),
    ownWishlistTitle: t("reveal.own_wishlist_title"),
    ownWishlistDescription: t("reveal.own_wishlist_description"),
    previousTitle: t("reveal.previous_title"),
    previousDescription: t("reveal.previous_description"),
    previousRow: t("reveal.previous_row"),
    notFoundTitle: t("reveal.not_found_title"),
    notFoundDescription: t("reveal.not_found_description"),
    unwrapError: t("reveal.unwrap_error"),
  };
}
