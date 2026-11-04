import { describe, expect, it } from "vitest";
import { requestCache } from "@/lib/request-cache";

describe("requestCache", () => {
  it("returns the wrapped function (react.cache is identity in tests)", async () => {
    const inner = async (n: number) => n * 2;
    const cached = requestCache(inner);
    await expect(cached(3)).resolves.toBe(6);
  });
});
