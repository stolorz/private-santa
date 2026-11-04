import { describe, expect, it } from "vitest";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serverError,
  TOO_MANY_REQUESTS,
  tooManyRequests,
  unavailable,
} from "@/lib/http";

describe("http helpers", () => {
  it("returns JSON error bodies with the expected status", async () => {
    const cases = [
      [badRequest("Bad"), 400, "Bad"],
      [forbidden(), 403, "Forbidden"],
      [forbidden("No"), 403, "No"],
      [notFound(), 404, "Not found"],
      [notFound("Gone"), 404, "Gone"],
      [conflict("Busy"), 409, "Busy"],
      [serverError("Boom"), 500, "Boom"],
      [unavailable("Down"), 503, "Down"],
      [tooManyRequests(), 429, TOO_MANY_REQUESTS],
    ] as const;

    for (const [response, status, error] of cases) {
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error });
    }
  });

  it("sets Retry-After on 429", () => {
    const response = tooManyRequests(12);
    expect(response.headers.get("Retry-After")).toBe("12");
  });
});
