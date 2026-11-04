import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.dirname(fileURLToPath(import.meta.url));

describe("drizzle journal", () => {
  it("has strictly increasing timestamps that are not in the future", () => {
    const journal = JSON.parse(
      readFileSync(path.join(root, "meta/_journal.json"), "utf8"),
    ) as {
      entries: Array<{ idx: number; when: number; tag: string }>;
    };

    expect(journal.entries.length).toBeGreaterThan(0);
    let previous = 0;
    for (const [i, entry] of journal.entries.entries()) {
      expect(entry.idx).toBe(i);
      expect(entry.when).toBeGreaterThan(previous);
      expect(entry.when).toBeLessThanOrEqual(Date.now());
      previous = entry.when;
    }
  });
});
