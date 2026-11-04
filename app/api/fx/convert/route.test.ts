import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeAppSetting } from "@/test/helpers/fixtures";
import { emptyRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { GET } from "./route";
import { asAdmin, asAnonymous, asUser } from "@/test/helpers/session";
import { FX_KEYS, resetFxInflight, setFxFetch, setFxNow } from "@/lib/fx";

const NOW = Date.parse("2026-10-27T12:00:00.000Z");

function convertRequest(query: string) {
  return emptyRequest(`http://localhost/api/fx/convert?${query}`, {
    method: "GET",
  });
}

function seedRates() {
  mockDb.seed(schema.appSetting, [
    makeAppSetting({ key: FX_KEYS.eurPln, value: "4.4056" }),
    makeAppSetting({ key: FX_KEYS.jpyPln, value: "0.025068" }),
    makeAppSetting({ key: FX_KEYS.asOf, value: "2026-10-27" }),
    makeAppSetting({
      key: FX_KEYS.fetchedAt,
      value: new Date(NOW).toISOString(),
    }),
  ]);
}

describe("GET /api/fx/convert", () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    await asAdmin();
    resetFxInflight();
    setFxFetch(fetchMock);
    setFxNow(() => NOW);
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("NBP should not be called"));
  });

  afterEach(() => {
    resetFxInflight();
    setFxFetch(null);
    setFxNow(null);
  });

  it("returns 401 when the caller is not logged in", async () => {
    await asAnonymous();
    const res = await GET(convertRequest("amount=100&currency=PLN"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    await asUser();
    const res = await GET(convertRequest("amount=100&currency=PLN"));
    expect(res.status).toBe(403);
  });

  it("returns converted amounts from the cached rate", async () => {
    seedRates();
    const res = await GET(convertRequest("amount=100&currency=PLN"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      EUR: 23,
      PLN: 100,
      JPY: 4000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts decimal amounts", async () => {
    seedRates();
    const sixEight = await GET(convertRequest("amount=6.8&currency=EUR"));
    expect(sixEight.status).toBe(200);
    await expect(sixEight.json()).resolves.toEqual({
      EUR: 6.8,
      PLN: 30,
      JPY: 1200,
    });
    const oneOne = await GET(convertRequest("amount=1.1&currency=EUR"));
    expect(oneOne.status).toBe(200);
    await expect(oneOne.json()).resolves.toMatchObject({ EUR: 1.1 });
  });

  it("converts zero in every currency", async () => {
    seedRates();
    for (const currency of ["EUR", "PLN", "JPY"]) {
      const res = await GET(convertRequest(`amount=0&currency=${currency}`));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ EUR: 0, PLN: 0, JPY: 0 });
    }
  });

  it("returns 400 for a bad amount or currency", async () => {
    const badAmount = await GET(convertRequest("amount=10.555&currency=PLN"));
    expect(badAmount.status).toBe(400);
    const blank = await GET(convertRequest("amount=&currency=EUR"));
    expect(blank.status).toBe(400);
    const badCurrency = await GET(convertRequest("amount=100&currency=GBP"));
    expect(badCurrency.status).toBe(400);
    const missing = await GET(emptyRequest("http://localhost/api/fx/convert", {
      method: "GET",
    }));
    expect(missing.status).toBe(400);
    await expect(badAmount.json()).resolves.toEqual({
      error: "Invalid amount or currency.",
    });
  });

  it("returns 503 when rates are unavailable", async () => {
    const res = await GET(convertRequest("amount=100&currency=PLN"));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Exchange rates are unavailable.",
    });
  });
});
