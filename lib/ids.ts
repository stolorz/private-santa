/** Lowercase, hyphenated slug. Empty / punctuation-only names become `event`. */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "event";
}

/** Short URL id. Names are not unique; this is. */
export const EVENT_CODE_LENGTH = 6;
export const REVEAL_TOKEN_LENGTH = 6;
export const EVENT_CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export const EVENT_CODE_RE = /^[0-9a-z]{6}$/;
export const REVEAL_TOKEN_RE = /^[0-9a-z]{6}$/;

/**
 * First URL segments used by the app. Guest tokens live at `/{token}`,
 * so these must never be minted as reveal ids.
 */
export const RESERVED_FIRST_SEGMENTS = new Set([
  "login",
  "signup",
  "events",
  "settings",
  "e",
  "api",
  "_next",
]);

export function isReservedFirstSegment(id: string): boolean {
  return RESERVED_FIRST_SEGMENTS.has(id);
}

function randomId(length: number): string {
  const alphabet = EVENT_CODE_ALPHABET;
  const cap = alphabet.length * Math.floor(256 / alphabet.length);
  const chars: string[] = [];
  const bytes = new Uint8Array(length);
  while (chars.length < length) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= cap) continue;
      chars.push(alphabet[b % alphabet.length]!);
      if (chars.length === length) break;
    }
  }
  return chars.join("");
}

/** Random 6-char id from digits + latin letters, e.g. `k7m2p9`. */
export function eventCode(): string {
  return randomId(EVENT_CODE_LENGTH);
}

/**
 * Guest-link id: 6-char `[0-9a-z]`. Retries past reserved first segments
 * (`signup`, `events`, …) so the token cannot take over a real route.
 */
export function revealToken(): string {
  for (let i = 0; i < 20; i++) {
    const token = randomId(REVEAL_TOKEN_LENGTH);
    if (!isReservedFirstSegment(token)) return token;
  }
  throw new Error("Could not allocate a reveal token.");
}
