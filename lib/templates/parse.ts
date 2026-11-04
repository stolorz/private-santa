import { isGender } from "@/lib/gender";
import { countBranchKey, isCountBranchKey } from "./count";
import {
  COUNT_SELECT_PLACEHOLDERS,
  GENDER_SELECT_PLACEHOLDERS,
  TEMPLATE_PLACEHOLDERS,
  type TemplatePlaceholder,
  type TemplateVars,
} from "./fields";

const KNOWN_VARS = new Set<string>(TEMPLATE_PLACEHOLDERS);
const GENDER_SELECT_VARS = new Set<string>(GENDER_SELECT_PLACEHOLDERS);
const COUNT_SELECT_VARS = new Set<string>(COUNT_SELECT_PLACEHOLDERS);

export type TemplatePlaceholderErrorReason =
  | "unknown"
  | "unclosed"
  | "empty"
  | "invalid"
  | "unknown_branch"
  | "duplicate_branch"
  | "invalid_select"
  | "not_allowed";

export type TemplateTokenPart = {
  start: number;
  end: number;
  kind: "name" | "pipe" | "branch_key" | "text";
  ok: boolean;
  reason?: TemplatePlaceholderErrorReason;
};

export type TemplatePlaceholderSpan = {
  start: number;
  end: number;
  name: string;
  closed: boolean;
  known: boolean;
  select: boolean;
  parts: TemplateTokenPart[];
  branches: Partial<Record<string, string>>;
  fallback?: string;
};

function simpleNameReason(name: string): TemplatePlaceholderErrorReason | null {
  if (name === "") return "empty";
  if (!/^[a-z_]+$/.test(name)) return "invalid";
  if (!KNOWN_VARS.has(name)) return "unknown";
  return null;
}

function selectNameReason(name: string): TemplatePlaceholderErrorReason | null {
  const simple = simpleNameReason(name);
  if (simple) return simple;
  if (!isSelectVar(name)) return "invalid_select";
  return null;
}

export function trimmedRange(
  raw: string,
  start: number,
): { start: number; end: number; value: string } {
  const value = raw.trim();
  if (value === "") return { start, end: start + raw.length, value };
  const lead = raw.length - raw.trimStart().length;
  return { start: start + lead, end: start + lead + value.length, value };
}

function part(
  start: number,
  end: number,
  kind: TemplateTokenPart["kind"],
  reason?: TemplatePlaceholderErrorReason,
): TemplateTokenPart {
  return reason
    ? { start, end, kind, ok: false, reason }
    : { start, end, kind, ok: true };
}

export function splitSelectSegments(
  body: string,
  innerStart: number,
): {
  segs: { start: number; end: number; text: string }[];
  pipes: { start: number; end: number }[];
} {
  const segs: { start: number; end: number; text: string }[] = [];
  const pipes: { start: number; end: number }[] = [];
  let offset = 0;
  while (true) {
    const next = body.indexOf("|", offset);
    if (next === -1) {
      segs.push({
        start: innerStart + offset,
        end: innerStart + body.length,
        text: body.slice(offset),
      });
      break;
    }
    segs.push({
      start: innerStart + offset,
      end: innerStart + next,
      text: body.slice(offset, next),
    });
    pipes.push({
      start: innerStart + next,
      end: innerStart + next + 1,
    });
    offset = next + 1;
  }
  return { segs, pipes };
}

function parseSimpleSpan(
  start: number,
  end: number,
  closed: boolean,
  innerStart: number,
  innerEnd: number,
  body: string,
): TemplatePlaceholderSpan {
  const reason = closed ? simpleNameReason(body) : "unclosed";
  return {
    start,
    end,
    name: body,
    closed,
    known: reason === null,
    select: false,
    parts: [part(innerStart, innerEnd, "name", reason ?? undefined)],
    branches: {},
  };
}

function parseSelectSpan(
  start: number,
  end: number,
  closed: boolean,
  innerStart: number,
  body: string,
): TemplatePlaceholderSpan {
  const { segs, pipes } = splitSelectSegments(body, innerStart);
  const parts: TemplateTokenPart[] = [];
  const branches: Partial<Record<string, string>> = {};
  const seen = new Set<string>();
  const nameSeg = segs[0]!;
  const rest = segs.slice(1);
  const nameRange = trimmedRange(nameSeg.text, nameSeg.start);
  const name = nameRange.value;
  const nameErr = selectNameReason(name);
  const canSelect = nameErr === null;
  const hasKeyedSegment = rest.some((seg) => seg.text.includes(":"));

  parts.push(
    part(nameRange.start, nameRange.end, "name", nameErr ?? undefined),
  );

  const forbidGenderFallback = canSelect && isGenderSelectVar(name);

  for (const [i, seg] of rest.entries()) {
    const pipe = pipes[i]!;
    const isLast = i === rest.length - 1;
    const colon = seg.text.indexOf(":");
    const emptyNotLast = colon === -1 && !isLast && seg.end === seg.start;
    const genderFallback = forbidGenderFallback && isLast && colon === -1;
    const trailingEmptyGenderPipe = genderFallback && seg.end === seg.start;
    const pipeErr =
      emptyNotLast ||
      trailingEmptyGenderPipe ||
      (!hasKeyedSegment && canSelect && isLast)
        ? "invalid_select"
        : undefined;
    parts.push(part(pipe.start, pipe.end, "pipe", pipeErr));
    if (colon === -1) {
      if (seg.end > seg.start) {
        parts.push(
          part(
            seg.start,
            seg.end,
            "text",
            !isLast || genderFallback || seg.text.includes("{")
              ? "invalid_select"
              : undefined,
          ),
        );
      }
      continue;
    }

    const keyRange = trimmedRange(seg.text.slice(0, colon), seg.start);
    const key = keyRange.value;
    const value = seg.text.slice(colon + 1);
    let keyErr: TemplatePlaceholderErrorReason | undefined;
    if (canSelect) {
      const knownKey = isGenderSelectVar(name)
        ? isGender(key)
        : isCountBranchKey(key);
      if (!knownKey) keyErr = "unknown_branch";
      else if (seen.has(key)) keyErr = "duplicate_branch";
      else {
        seen.add(key);
        branches[key] = value;
      }
    }
    parts.push(part(keyRange.start, keyRange.end, "branch_key", keyErr));
    if (value.length > 0) {
      parts.push(
        part(
          seg.start + colon + 1,
          seg.end,
          "text",
          value.includes("{") ? "invalid_select" : undefined,
        ),
      );
    }
  }

  const lastRest = rest[rest.length - 1];
  const span: TemplatePlaceholderSpan = {
    start,
    end,
    name,
    closed,
    known: closed && nameErr === null && parts.every((item) => item.ok),
    select: true,
    parts,
    branches,
  };
  if (
    lastRest &&
    !lastRest.text.includes(":") &&
    !isGenderSelectVar(name)
  ) {
    span.fallback = lastRest.text;
  }
  return span;
}

function parsePlaceholderSpan(
  text: string,
  start: number,
  end: number,
  closed: boolean,
): TemplatePlaceholderSpan {
  const innerStart = start + 1;
  const innerEnd = closed ? end - 1 : end;
  const body = text.slice(innerStart, innerEnd);
  if (!body.includes("|")) {
    return parseSimpleSpan(start, end, closed, innerStart, innerEnd, body);
  }
  return parseSelectSpan(start, end, closed, innerStart, body);
}

function resolveCountSelect(
  span: TemplatePlaceholderSpan,
  raw: string,
  language: string,
): string {
  if (!/^\d+$/.test(raw)) return span.fallback ?? "";
  const key = countBranchKey(language, Number(raw));
  const chosen =
    key != null && Object.prototype.hasOwnProperty.call(span.branches, key)
      ? span.branches[key]!
      : (span.fallback ?? "");
  return chosen.replaceAll("#", raw);
}

function resolveSpan(
  template: string,
  span: TemplatePlaceholderSpan,
  vars: TemplateVars,
  language: string,
): string {
  const token = template.slice(span.start, span.end);
  if (!span.known) return token;
  if (!Object.prototype.hasOwnProperty.call(vars, span.name)) return token;
  if (span.select) {
    if (isCountSelectVar(span.name)) {
      return resolveCountSelect(span, vars.guest_count ?? "", language);
    }
    const value = vars[span.name as TemplatePlaceholder] ?? "";
    if (
      isGender(value) &&
      Object.prototype.hasOwnProperty.call(span.branches, value)
    ) {
      return span.branches[value]!;
    }
    return "";
  }
  return vars[span.name as TemplatePlaceholder] ?? "";
}

/**
 * Replace `{name}` tokens, `{name|female:…|male:…}` gender selects,
 * and `{guest_count|1:…|2:…|fallback}` count selects (`#` is the number).
 * Keys omitted from `vars` are left untouched so `{receiver}` can stay in
 * pre-unwrap copy.
 */
export function interpolate(
  template: string,
  vars: TemplateVars,
  language = "en",
): string {
  const spans = parseTemplatePlaceholders(template);
  if (spans.length === 0) return template;
  let out = "";
  let i = 0;
  for (const span of spans) {
    if (span.start > i) out += template.slice(i, span.start);
    out += resolveSpan(template, span, vars, language);
    i = span.end;
  }
  if (i < template.length) out += template.slice(i);
  return out;
}

export function parseTemplatePlaceholders(
  text: string,
): TemplatePlaceholderSpan[] {
  const spans: TemplatePlaceholderSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;
    const close = text.indexOf("}", start + 1);
    if (close === -1) {
      spans.push(parsePlaceholderSpan(text, start, text.length, false));
      break;
    }
    spans.push(parsePlaceholderSpan(text, start, close + 1, true));
    i = close + 1;
  }
  return spans;
}

export function isGenderSelectVar(name: string): boolean {
  return GENDER_SELECT_VARS.has(name);
}

export function isCountSelectVar(name: string): boolean {
  return COUNT_SELECT_VARS.has(name);
}

export function isSelectVar(name: string): boolean {
  return isGenderSelectVar(name) || isCountSelectVar(name);
}
