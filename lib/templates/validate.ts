import { languageLabel } from "@/lib/language";
import {
  allowedPlaceholdersFor,
  TEMPLATE_FIELDS,
  TEMPLATE_IDS,
  TEMPLATE_ITEMS,
  TEMPLATE_LANGUAGES,
  templatesViewWithDefaults,
  type TemplateId,
  type TemplateLanguage,
  type TemplatesPatch,
  type TemplatesView,
} from "./fields";
import {
  isCountSelectVar,
  isGenderSelectVar,
  parseTemplatePlaceholders,
  type TemplatePlaceholderErrorReason,
  type TemplateTokenPart,
} from "./parse";

export type TemplatePlaceholderError = {
  start: number;
  end: number;
  name: string;
  token: string;
  reason: TemplatePlaceholderErrorReason;
  message: string;
};

export type TemplateViewError = {
  language: TemplateLanguage;
  id: TemplateId;
  label: string;
  token: string;
  reason: TemplatePlaceholderErrorReason;
  message: string;
};

export type PlaceholderErrorDetail = {
  token?: string;
  varName?: string;
  kind?: TemplateTokenPart["kind"];
  lastPart?: boolean;
  keyed?: boolean;
};

function withPeriod(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function curlyQuote(value: string): string {
  return `\u201c${value}\u201d`;
}

function genderHelp(): string {
  return "Write female: and male: only.";
}

function countHelp(): string {
  return "Write 1: and 2: choices, then an optional fallback.";
}

function invalidSelectMessage(
  name: string,
  detail: PlaceholderErrorDetail,
): string {
  const varName = detail.varName ?? name;
  const token = detail.token ?? name;
  const gender = isGenderSelectVar(varName);
  const count = isCountSelectVar(varName);
  const help = gender ? genderHelp() : count ? countHelp() : "";
  if (detail.kind === "name" || (!gender && !count)) {
    return `{${varName}} cannot use | choices.`;
  }
  if (detail.kind === "text" && token.includes("{")) {
    return `{${varName}} cannot contain another { inside a choice.`;
  }
  if (detail.kind === "text") {
    return `{${varName}} cannot use the fallback ${curlyQuote(token)}. ${help}`;
  }
  if (!detail.keyed) {
    return gender
      ? `{${varName}} needs female: or male: choices.`
      : `{${varName}} needs 1: or 2: choices.`;
  }
  if (detail.lastPart) {
    return `{${varName}} has a trailing |. ${help}`;
  }
  return `{${varName}} has an empty choice.`;
}

function unknownBranchMessage(
  name: string,
  detail: PlaceholderErrorDetail,
): string {
  const which = detail.varName ?? "";
  const use = isGenderSelectVar(which)
    ? " Use female or male."
    : isCountSelectVar(which)
      ? " Use 1 or 2."
      : "";
  if (name.trim() === "") {
    return `That choice has no name.${use}`;
  }
  return `${name} is not a valid choice.${use}`;
}

export function placeholderErrorMessage(
  reason: TemplatePlaceholderErrorReason,
  name: string,
  detail: PlaceholderErrorDetail = {},
): string {
  switch (reason) {
    case "unknown_branch":
      return unknownBranchMessage(name, detail);
    case "duplicate_branch":
      return `${name} is listed twice.`;
    case "invalid_select":
      return invalidSelectMessage(name, detail);
    case "unclosed":
      return `${detail.token ?? `{${name}`} is missing a closing }.`;
    case "empty":
      return "{} is empty. Put a variable name inside the braces.";
    case "invalid":
      return `{${name}} is not a valid variable name.`;
    case "not_allowed":
      return `{${name}} cannot be used in this template.`;
    case "unknown":
    default:
      return `{${name}} is not a known variable.`;
  }
}

function makeError(
  start: number,
  end: number,
  name: string,
  text: string,
  reason: TemplatePlaceholderErrorReason,
  detail: PlaceholderErrorDetail = {},
): TemplatePlaceholderError {
  const token = text.slice(start, end);
  return {
    start,
    end,
    name,
    token,
    reason,
    message: placeholderErrorMessage(reason, name, { ...detail, token }),
  };
}

export function templatePlaceholderErrors(
  text: string,
): TemplatePlaceholderError[] {
  return parseTemplatePlaceholders(text).flatMap((span) => {
    if (span.closed && span.known) return [];
    if (!span.select) {
      const reason = span.parts[0]?.reason ?? "unknown";
      return [
        makeError(span.start, span.end, span.name, text, reason, {
          varName: span.name,
          kind: span.parts[0]?.kind ?? "name",
        }),
      ];
    }
    const errors: TemplatePlaceholderError[] = [];
    if (!span.closed) {
      errors.push(
        makeError(span.start, span.end, span.name, text, "unclosed", {
          varName: span.name,
          kind: "name",
        }),
      );
    }
    const lastPart = span.parts[span.parts.length - 1];
    const keyed = Object.keys(span.branches).length > 0;
    for (const item of span.parts) {
      if (item.ok || !item.reason || item.reason === "unclosed") continue;
      const name =
        item.kind === "branch_key"
          ? text.slice(item.start, item.end).trim()
          : span.name;
      errors.push(
        makeError(item.start, item.end, name, text, item.reason, {
          varName: span.name,
          kind: item.kind,
          lastPart: item === lastPart,
          keyed,
        }),
      );
    }
    return errors;
  });
}

function fieldLabel(id: TemplateId): string {
  return TEMPLATE_FIELDS.find((field) => field.id === id)?.label ?? id;
}

export function templateErrorPath(id: TemplateId, label: string): string {
  const field = TEMPLATE_FIELDS.find((item) => item.id === id);
  if (!field) return label;
  const ambiguous = TEMPLATE_FIELDS.some(
    (item) => item.label === field.label && item.id !== field.id,
  );
  if (!ambiguous) return label;
  const item = TEMPLATE_ITEMS.find((row) => row.id === field.item);
  return item ? `${item.label} · ${label}` : label;
}

export function templateErrorLine(error: TemplateViewError): string {
  return `${languageLabel(error.language)} · ${templateErrorPath(error.id, error.label)}: ${error.message}`;
}

function collectViewErrors(
  language: TemplateLanguage,
  id: TemplateId,
  text: string,
): TemplateViewError[] {
  const allowed = allowedPlaceholdersFor(id);
  const extra =
    allowed == null
      ? []
      : parseTemplatePlaceholders(text).flatMap((span) => {
          if (!span.closed || !span.known) return [];
          if (allowed.includes(span.name)) return [];
          return [
            makeError(span.start, span.end, span.name, text, "not_allowed", {
              varName: span.name,
              kind: "name",
            }),
          ];
        });
  return [...templatePlaceholderErrors(text), ...extra].map((error) => ({
    language,
    id,
    label: fieldLabel(id),
    token: error.token,
    reason: error.reason,
    message: error.message,
  }));
}

export function templatesViewErrors(view: TemplatesView): TemplateViewError[] {
  const errors: TemplateViewError[] = [];
  for (const language of TEMPLATE_LANGUAGES) {
    for (const id of TEMPLATE_IDS) {
      const text = view[language]?.[id];
      if (typeof text !== "string") continue;
      errors.push(...collectViewErrors(language, id, text));
    }
  }
  return errors;
}

/** Skip blanks — those restore defaults, which are already valid. */
export function templatePatchErrors(patch: TemplatesPatch): TemplateViewError[] {
  const errors: TemplateViewError[] = [];
  for (const language of TEMPLATE_LANGUAGES) {
    const fields = patch[language];
    if (!fields) continue;
    for (const id of TEMPLATE_IDS) {
      const value = fields[id];
      if (typeof value !== "string" || value.trim() === "") continue;
      errors.push(...collectViewErrors(language, id, value));
    }
  }
  return errors;
}

export function invalidTemplateCount(errors: TemplateViewError[]): number {
  const keys = new Set<string>();
  for (const error of errors) {
    keys.add(`${error.language}\0${error.id}`);
  }
  return keys.size;
}

/** One problem line per broken placeholder, split by language. */
export function templateErrorCounts(errors: readonly TemplateViewError[]): {
  total: number;
  byLanguage: Record<TemplateLanguage, number>;
} {
  const byLanguage = Object.fromEntries(
    TEMPLATE_LANGUAGES.map((language) => [language, 0]),
  ) as Record<TemplateLanguage, number>;
  for (const error of errors) byLanguage[error.language] += 1;
  return { total: errors.length, byLanguage };
}

/** Problem lines in a stored view, including ids filled from the defaults. */
export function templateErrorTotal(view: TemplatesView): number {
  return templateErrorCounts(
    templatesViewErrors(templatesViewWithDefaults(view)),
  ).total;
}

export function invalidTemplatesHeading(count: number): string {
  return count === 1
    ? "1 template is not valid"
    : `${count} templates are not valid`;
}

export function invalidTemplatesSaveReason(count: number): string {
  return `Save is disabled because ${invalidTemplatesHeading(count)}.`;
}

function firstErrorByTemplate(
  errors: TemplateViewError[],
): TemplateViewError[] {
  const seen = new Set<string>();
  const first: TemplateViewError[] = [];
  for (const error of errors) {
    const key = `${error.language}\0${error.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    first.push(error);
  }
  return first;
}

export function invalidTemplatesReason(view: TemplatesView): string | null {
  const errors = templatesViewErrors(view);
  if (errors.length === 0) return null;
  const count = invalidTemplateCount(errors);
  const parts = firstErrorByTemplate(errors).map(
    (error) =>
      `${languageLabel(error.language)} ${templateErrorPath(error.id, error.label)}: ${error.message}`,
  );
  return withPeriod(
    `Cannot send invitations because ${invalidTemplatesHeading(count)}: ${parts.join("; ")}`,
  );
}

export function invalidPlaceholderRequestError(
  error: TemplateViewError,
): string {
  return withPeriod(`Invalid placeholder in ${templateErrorLine(error)}`);
}
