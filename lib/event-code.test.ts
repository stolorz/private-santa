import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_CODE_ALPHABET,
  EVENT_CODE_RE,
  REVEAL_TOKEN_RE,
  RESERVED_FIRST_SEGMENTS,
  compareEventsByRecency,
  allocateUniqueRevealToken,
  eventCode,
  eventLabel,
  formatOccursOn,
  isOccursOnPast,
  isReservedFirstSegment,
  isValidOccursOn,
  revealToken,
  slugify,
} from "@/lib/event-code";

const APP_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "app");

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("My Family")).toBe("my-family");
  });

  it("strips accents", () => {
    expect(slugify("Łódź Friends")).toBe("odz-friends");
  });

  it("falls back to event when empty", () => {
    expect(slugify("!!!")).toBe("event");
  });
});

describe("eventCode", () => {
  it("returns a 6-char id of digits and latin letters", () => {
    expect(eventCode()).toMatch(EVENT_CODE_RE);
  });

  it("does not repeat in a small sample", () => {
    const ids = new Set(Array.from({ length: 20 }, () => eventCode()));
    expect(ids.size).toBe(20);
  });
});

describe("RESERVED_FIRST_SEGMENTS", () => {
  it("covers every first URL segment from app pages and API routes", () => {
    const segments = new Set<string>();
    for (const rel of walkAppFiles(APP_ROOT, ["page.tsx", "route.ts"])) {
      const first = firstUrlSegment(rel);
      if (first) segments.add(first);
    }
    const missing = [...segments].filter((s) => !RESERVED_FIRST_SEGMENTS.has(s));
    expect(missing).toEqual([]);
  });

  it("treats app first segments as reserved", () => {
    expect(isReservedFirstSegment("events")).toBe(true);
    expect(isReservedFirstSegment("signup")).toBe(true);
    expect(isReservedFirstSegment("e")).toBe(true);
    expect(isReservedFirstSegment("k7m2p9")).toBe(false);
  });
});

describe("revealToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 6-char id of digits and latin letters", () => {
    expect(revealToken()).toMatch(REVEAL_TOKEN_RE);
    expect(isReservedFirstSegment(revealToken())).toBe(false);
  });

  it("uses the requested length from random bytes", () => {
    const okBytes = bytesFor("abcdef");
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(okBytes);
      return arr;
    });
    expect(revealToken()).toBe("abcdef");
  });

  it("retries when the draw is a reserved first segment", () => {
    const reserved = bytesFor("signup");
    const ok = bytesFor("abcdef");
    let calls = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(calls++ === 0 ? reserved : ok);
      return arr;
    });
    expect(revealToken()).toBe("abcdef");
  });

  it("throws when every draw is a reserved first segment", () => {
    const reserved = bytesFor("signup");
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(reserved);
      return arr;
    });
    expect(() => revealToken()).toThrow("Could not allocate a reveal token.");
  });
});

describe("allocateUniqueRevealToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the first free id", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(bytesFor("abcdef"));
      return arr;
    });
    const used = new Set<string>();
    expect(allocateUniqueRevealToken(used)).toBe("abcdef");
    expect([...used]).toEqual(["abcdef"]);
  });

  it("does not keep a reserved first segment", () => {
    const reserved = bytesFor("signup");
    const free = bytesFor("abcdef");
    let calls = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(calls++ === 0 ? reserved : free);
      return arr;
    });
    const used = new Set<string>();
    expect(allocateUniqueRevealToken(used)).toBe("abcdef");
    expect([...used]).toEqual(["abcdef"]);
  });

  it("skips an id that is already used", () => {
    const taken = bytesFor("abcdef");
    const free = bytesFor("zzzzzz");
    let calls = 0;
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(calls++ === 0 ? taken : free);
      return arr;
    });
    const used = new Set(["abcdef"]);
    expect(allocateUniqueRevealToken(used)).toBe("zzzzzz");
    expect([...used]).toEqual(["abcdef", "zzzzzz"]);
  });

  it("throws when every draw is already used", () => {
    const taken = bytesFor("abcdef");
    vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
      (arr as Uint8Array).set(taken);
      return arr;
    });
    expect(() => allocateUniqueRevealToken(new Set(["abcdef"]))).toThrow(
      "Could not allocate a reveal token.",
    );
  });
});

function walkAppFiles(dir: string, names: string[], prefix = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkAppFiles(abs, names, rel));
    else if (names.includes(ent.name)) out.push(rel);
  }
  return out;
}

function firstUrlSegment(rel: string): string | null {
  const parts = rel.split("/").filter((p) => p && !/^\(.*\)$/.test(p));
  const first = parts[0];
  if (!first || first === "page.tsx" || first === "route.ts") return null;
  if (first.startsWith("[") && first.endsWith("]")) return null;
  return first;
}

function bytesFor(id: string): Uint8Array {
  return Uint8Array.from(
    [...id].map((c) => {
      const i = EVENT_CODE_ALPHABET.indexOf(c);
      if (i < 0) throw new Error(`not in alphabet: ${c}`);
      return i;
    }),
  );
}

describe("isValidOccursOn", () => {
  it("accepts a real calendar date", () => {
    expect(isValidOccursOn("2026-12-25")).toBe(true);
  });

  it("rejects nonsense dates", () => {
    expect(isValidOccursOn("2026-13-01")).toBe(false);
    expect(isValidOccursOn("2026-02-30")).toBe(false);
    expect(isValidOccursOn("25-12-2026")).toBe(false);
  });
});

describe("eventLabel", () => {
  it("returns the edition name", () => {
    expect(eventLabel({ name: "  Xmas  " })).toBe("Xmas");
  });
});

describe("formatOccursOn", () => {
  it("formats YYYY-MM-DD in en-GB", () => {
    expect(formatOccursOn("2026-12-25")).toBe("25 Dec 2026");
  });

  it("returns the original string when a part is missing", () => {
    expect(formatOccursOn("not-a-date")).toBe("not-a-date");
    expect(formatOccursOn("2026-00-01")).toBe("2026-00-01");
  });
});

describe("isOccursOnPast", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");

  it("treats earlier calendar days as past", () => {
    expect(isOccursOnPast("2026-10-26", now)).toBe(true);
    expect(isOccursOnPast("2025-12-25", now)).toBe(true);
  });

  it("keeps today and future dates open", () => {
    expect(isOccursOnPast("2026-10-27", now)).toBe(false);
    expect(isOccursOnPast("2026-10-28", now)).toBe(false);
  });

  it("does not treat a blank or invalid date as past", () => {
    expect(isOccursOnPast("", now)).toBe(false);
    expect(isOccursOnPast("not-a-date", now)).toBe(false);
    expect(isOccursOnPast("2026-13-01", now)).toBe(false);
  });
});

describe("compareEventsByRecency", () => {
  it("sorts by occursOn, then createdAt, then id", () => {
    const older = {
      occursOn: "2025-12-24",
      createdAt: new Date("2025-01-01"),
      id: 2,
    };
    const newerDate = {
      occursOn: "2026-12-24",
      createdAt: new Date("2025-01-01"),
      id: 1,
    };
    const sameDateNewerCreated = {
      occursOn: "2026-12-24",
      createdAt: new Date("2026-01-01"),
      id: 1,
    };
    const sameCreatedHigherId = {
      occursOn: "2026-12-24",
      createdAt: new Date("2026-01-01"),
      id: 9,
    };
    expect(compareEventsByRecency(newerDate, older)).toBeLessThan(0);
    expect(compareEventsByRecency(older, newerDate)).toBeGreaterThan(0);
    expect(
      compareEventsByRecency(sameDateNewerCreated, newerDate),
    ).toBeLessThan(0);
    expect(
      compareEventsByRecency(sameCreatedHigherId, sameDateNewerCreated),
    ).toBeLessThan(0);
    expect(
      compareEventsByRecency(
        { occursOn: "2026-12-24", createdAt: "2026-01-01T00:00:00.000Z" },
        { occursOn: "2026-12-24", createdAt: "2026-01-01T00:00:00.000Z" },
      ),
    ).toBe(0);
  });
});
