import { GENDER_CODES } from "@/lib/gender";
import { COUNT_BRANCH_KEYS } from "./count";
import {
  TEMPLATE_PLACEHOLDERS,
  type TemplatePlaceholder,
} from "./fields";
import {
  isCountSelectVar,
  isSelectVar,
  splitSelectSegments,
  trimmedRange,
} from "./parse";

type TemplatePlaceholderAtBase = {
  start: number;
  end: number;
  query: string;
  closed: boolean;
};

export type TemplatePlaceholderAt =
  | (TemplatePlaceholderAtBase & { mode: "name" })
  | (TemplatePlaceholderAtBase & {
      mode: "branch_key";
      selectVar: string;
      keyStart: number;
      keyEnd: number;
      hasColon: boolean;
    });

export function templatePlaceholderAt(
  text: string,
  cursor: number,
): TemplatePlaceholderAt | null {
  if (cursor <= 0 || cursor > text.length) return null;
  const open = text.lastIndexOf("{", cursor - 1);
  if (open < 0 || cursor <= open) return null;
  if (text.slice(open + 1, cursor).includes("}")) return null;
  const after = text.slice(cursor);
  const closeAfter = after.indexOf("}");
  const nextOpenAfter = after.indexOf("{");
  let end: number;
  let closed = false;
  if (closeAfter === -1) {
    end = text.length;
  } else if (nextOpenAfter !== -1 && nextOpenAfter < closeAfter) {
    end = cursor + nextOpenAfter;
  } else {
    end = cursor + closeAfter + 1;
    closed = true;
  }
  const innerStart = open + 1;
  const innerEnd = closed ? end - 1 : end;
  const { segs } = splitSelectSegments(
    text.slice(innerStart, innerEnd),
    innerStart,
  );
  const nameSeg = segs[0];
  if (!nameSeg || segs.length < 2 || cursor <= nameSeg.end) {
    return {
      start: open,
      end,
      query: text.slice(innerStart, cursor),
      closed,
      mode: "name",
    };
  }
  const selectVar = nameSeg.text.trim();
  if (!isSelectVar(selectVar)) return null;

  const seg = segs.slice(1).find(
    (item) => cursor >= item.start && cursor <= item.end,
  )!;
  const colon = text.indexOf(":", seg.start);
  const colonInSeg = colon !== -1 && colon < seg.end;
  if (colonInSeg && cursor > colon) return null;
  const rawKeyEnd = colonInSeg ? colon : seg.end;
  const rawKey = text.slice(seg.start, rawKeyEnd);
  const range = trimmedRange(rawKey, seg.start);
  const empty = rawKey.trim() === "";
  return {
    start: open,
    end,
    query: text.slice(seg.start, cursor),
    closed,
    mode: "branch_key",
    selectVar,
    keyStart: empty ? seg.start : range.start,
    keyEnd: empty ? rawKeyEnd : range.end,
    hasColon: colonInSeg,
  };
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function rankNames<T extends string>(query: string, names: readonly T[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...names];
  const prefix = names.filter((name) => name.startsWith(q));
  if (prefix.length > 0) return prefix;
  const maxDist = q.length >= 3 ? 2 : q.length === 2 ? 1 : 0;
  if (maxDist === 0) return [];
  return names
    .map((name) => ({ name, distance: editDistance(q, name) }))
    .filter(({ distance }) => distance <= maxDist)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .map(({ name }) => name);
}

export function suggestTemplatePlaceholders(
  query: string,
  names: readonly string[] = TEMPLATE_PLACEHOLDERS,
): TemplatePlaceholder[] {
  return rankNames(query, names) as TemplatePlaceholder[];
}

export function suggestSelectBranchKeys(
  query: string,
  selectVar?: string,
): string[] {
  const names = isCountSelectVar(selectVar ?? "")
    ? COUNT_BRANCH_KEYS
    : GENDER_CODES;
  return rankNames(query, names);
}

export function insertTemplatePlaceholder(
  text: string,
  cursor: number,
  name: string,
): { text: string; cursor: number } {
  const at = templatePlaceholderAt(text, cursor);
  if (at?.mode === "branch_key") {
    const insertion = at.hasColon ? name : `${name}:`;
    const next = text.slice(0, at.keyStart) + insertion + text.slice(at.keyEnd);
    return { text: next, cursor: at.keyStart + insertion.length };
  }
  const token = `{${name}}`;
  if (!at) {
    const next = text.slice(0, cursor) + token + text.slice(cursor);
    return { text: next, cursor: cursor + token.length };
  }
  const next = text.slice(0, at.start) + token + text.slice(at.end);
  return { text: next, cursor: at.start + token.length };
}
