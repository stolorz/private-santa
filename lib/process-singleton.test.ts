import { describe, expect, it } from "vitest";
import { processSingleton } from "@/lib/process-singleton";

describe("processSingleton", () => {
  it("creates once and reuses the stored value", () => {
    const key = `__santaTestSingleton_${Date.now()}`;
    let created = 0;
    const first = processSingleton(key, () => {
      created += 1;
      return { n: created };
    });
    const second = processSingleton(key, () => {
      created += 1;
      return { n: created };
    });
    expect(first).toBe(second);
    expect(created).toBe(1);
    delete (globalThis as Record<string, unknown>)[key];
  });
});
