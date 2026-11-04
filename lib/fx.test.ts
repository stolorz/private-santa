import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeAppSetting } from "@/test/helpers/fixtures";
import { DomainError } from "@/lib/errors";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import {
  FX_KEYS,
  FX_TTL_MS,
  convertBudget,
  convertEventBudget,
  getFxRates,
  parseNbpTableA,
  resetFxInflight,
  setFxFetch,
  setFxNow,
} from "./fx";

const EUR_PLN = 4.4056;
const JPY_PLN = 0.025068;
const NOW = Date.parse("2026-10-27T12:00:00.000Z");

const TABLE_A = [
  {
    effectiveDate: "2026-10-27",
    rates: [
      { currency: "euro", code: "EUR", mid: EUR_PLN },
      { currency: "jen (Japonia)", code: "JPY", mid: JPY_PLN },
    ],
  },
];

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function seedCache(fetchedAt = NOW) {
  mockDb.seed(schema.appSetting, [
    makeAppSetting({ key: FX_KEYS.eurPln, value: String(EUR_PLN) }),
    makeAppSetting({ key: FX_KEYS.jpyPln, value: String(JPY_PLN) }),
    makeAppSetting({ key: FX_KEYS.asOf, value: "2026-10-27" }),
    makeAppSetting({
      key: FX_KEYS.fetchedAt,
      value: new Date(fetchedAt).toISOString(),
    }),
  ]);
}

describe("parseNbpTableA", () => {
  it("reads EUR and JPY mids from table A", () => {
    expect(parseNbpTableA(TABLE_A)).toEqual({
      eurPln: EUR_PLN,
      jpyPln: JPY_PLN,
      asOf: "2026-10-27",
    });
  });

  it("rejects out-of-band or incomplete tables", () => {
    expect(parseNbpTableA(null)).toBeNull();
    expect(parseNbpTableA({ effectiveDate: "", rates: [] })).toBeNull();
    expect(parseNbpTableA({ effectiveDate: "2026-10-27", rates: "nope" })).toBeNull();
    expect(
      parseNbpTableA({
        effectiveDate: "2026-10-27",
        rates: [null, { code: 1, mid: 4 }, { code: "USD", mid: 4 }, { code: "EUR", mid: EUR_PLN }, { code: "JPY", mid: JPY_PLN }],
      }),
    ).toEqual({ eurPln: EUR_PLN, jpyPln: JPY_PLN, asOf: "2026-10-27" });
    expect(
      parseNbpTableA([
        {
          effectiveDate: "2026-10-27",
          rates: [
            { code: "EUR", mid: 10 },
            { code: "JPY", mid: JPY_PLN },
          ],
        },
      ]),
    ).toBeNull();
    expect(
      parseNbpTableA([
        {
          effectiveDate: "2026-10-27",
          rates: [{ code: "EUR", mid: EUR_PLN }],
        },
      ]),
    ).toBeNull();
  });
});

describe("convertBudget", () => {
  const rates = { eurPln: EUR_PLN, jpyPln: JPY_PLN };

  it("keeps the primary amount exact and humanizes extras", () => {
    expect(convertBudget(100, "PLN", rates)).toEqual({
      EUR: 23,
      PLN: 100,
      JPY: 4000,
    });
    expect(convertBudget(23, "EUR", rates)).toEqual({
      EUR: 23,
      PLN: 100,
      JPY: 4000,
    });
    expect(convertBudget(1200, "JPY", rates)).toEqual({
      EUR: 6.8,
      PLN: 30,
      JPY: 1200,
    });
    expect(convertBudget(120, "JPY", rates)?.EUR).toBe(0.68);
  });

  it("humanizes extras at even 4 / 0.02 rates", () => {
    const even = { eurPln: 4, jpyPln: 0.02 };
    expect(convertBudget(1200, "JPY", even)).toEqual({
      EUR: 6,
      PLN: 24,
      JPY: 1200,
    });
    expect(convertBudget(120, "JPY", even)).toEqual({
      EUR: 0.6,
      PLN: 2.4,
      JPY: 120,
    });
  });

  it("rounds halves up and leaves values under .5 down", () => {
    const even = { eurPln: 4, jpyPln: 0.02 };
    expect(convertBudget(93, "PLN", even)?.EUR).toBe(23);
    expect(convertBudget(94, "PLN", even)?.EUR).toBe(24);
  });

  it("keeps a non-round primary exact across the humanize bands", () => {
    const even = { eurPln: 4, jpyPln: 0.02 };
    expect(convertBudget(1234, "PLN", even)).toEqual({
      EUR: 310,
      PLN: 1234,
      JPY: 62000,
    });
    expect(convertBudget(0.1, "EUR", even)).toEqual({
      EUR: 0.1,
      PLN: 0.4,
      JPY: 20,
    });
    expect(convertBudget(1.25, "EUR", even)).toEqual({
      EUR: 1.25,
      PLN: 5,
      JPY: 250,
    });
    expect(convertBudget(25, "EUR", even)).toEqual({
      EUR: 25,
      PLN: 100,
      JPY: 5000,
    });
    expect(convertBudget(0.5, "JPY", even)).toEqual({
      EUR: 0,
      PLN: 0.01,
      JPY: 0.5,
    });
  });

  it("converts zero to zero in every currency", () => {
    for (const currency of ["EUR", "PLN", "JPY"] as const) {
      expect(convertBudget(0, currency, rates)).toEqual({
        EUR: 0,
        PLN: 0,
        JPY: 0,
      });
    }
  });

  it("accepts rates on the plausibility edges and rejects those just outside", () => {
    expect(convertBudget(10, "EUR", { eurPln: 3, jpyPln: 0.02 })).toEqual({
      EUR: 10,
      PLN: 30,
      JPY: 1500,
    });
    expect(convertBudget(10, "EUR", { eurPln: 6, jpyPln: 0.02 })).toEqual({
      EUR: 10,
      PLN: 60,
      JPY: 3000,
    });
    expect(convertBudget(10, "EUR", { eurPln: 4, jpyPln: 0.01 })).toEqual({
      EUR: 10,
      PLN: 40,
      JPY: 4000,
    });
    expect(convertBudget(10, "EUR", { eurPln: 4, jpyPln: 0.05 })).toEqual({
      EUR: 10,
      PLN: 40,
      JPY: 800,
    });
    expect(
      convertBudget(10, "EUR", { eurPln: 2.999, jpyPln: 0.02 }),
    ).toBeNull();
    expect(
      convertBudget(10, "EUR", { eurPln: 6.001, jpyPln: 0.02 }),
    ).toBeNull();
    expect(convertBudget(10, "EUR", { eurPln: 4, jpyPln: 0.009 })).toBeNull();
    expect(convertBudget(10, "EUR", { eurPln: 4, jpyPln: 0.051 })).toBeNull();
  });

  it("returns null for invalid amounts or rates", () => {
    expect(convertBudget(Number.NaN, "PLN", rates)).toBeNull();
    expect(convertBudget(Infinity, "PLN", rates)).toBeNull();
    expect(convertBudget(-1, "PLN", rates)).toBeNull();
    expect(convertBudget(100, "PLN", { eurPln: 0, jpyPln: JPY_PLN })).toBeNull();
    expect(
      convertBudget(100, "PLN", { eurPln: Number.NaN, jpyPln: JPY_PLN }),
    ).toBeNull();
    expect(
      convertBudget(100, "PLN", { eurPln: EUR_PLN, jpyPln: Infinity }),
    ).toBeNull();
    expect(convertBudget(Number.MAX_VALUE, "EUR", rates)).toBeNull();
  });
});

describe("getFxRates", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetFxInflight();
    setFxFetch(fetchMock);
    setFxNow(() => NOW);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(TABLE_A));
  });

  afterEach(() => {
    resetFxInflight();
    setFxFetch(null);
    setFxNow(null);
  });

  it("serves a fresh cache without calling NBP", async () => {
    seedCache(NOW - 60_000);
    await expect(getFxRates()).resolves.toEqual({
      eurPln: EUR_PLN,
      jpyPln: JPY_PLN,
      asOf: "2026-10-27",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when the cache is older than 24h", async () => {
    seedCache(NOW - FX_TTL_MS - 1);
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          effectiveDate: "2026-10-28",
          rates: [
            { code: "EUR", mid: 4.5 },
            { code: "JPY", mid: 0.026 },
          ],
        },
      ]),
    );

    await expect(getFxRates()).resolves.toEqual({
      eurPln: 4.5,
      jpyPln: 0.026,
      asOf: "2026-10-28",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps a stale cache when NBP fails", async () => {
    seedCache(NOW - FX_TTL_MS - 1);
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
    await expect(getFxRates()).resolves.toEqual({
      eurPln: EUR_PLN,
      jpyPln: JPY_PLN,
      asOf: "2026-10-27",
    });
  });

  it("throws when there is no cache and NBP fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(getFxRates()).rejects.toMatchObject({
      name: "DomainError",
      status: 503,
    });
  });

  it("does not call NBP twice within 24h after a fetch", async () => {
    await getFxRates();
    await getFxRates();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shares an in-flight fetch", async () => {
    resetFxInflight();
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockImplementation(() => pending);
    const a = getFxRates();
    const b = getFxRates();
    resolveFetch(jsonResponse(TABLE_A));
    await expect(Promise.all([a, b])).resolves.toEqual([
      { eurPln: EUR_PLN, jpyPln: JPY_PLN, asOf: "2026-10-27" },
      { eurPln: EUR_PLN, jpyPln: JPY_PLN, asOf: "2026-10-27" },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the real clock after setFxNow(null)", async () => {
    seedCache(Date.now());
    setFxNow(null);
    await expect(getFxRates()).resolves.toMatchObject({
      eurPln: EUR_PLN,
      jpyPln: JPY_PLN,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("convertEventBudget", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetFxInflight();
    setFxFetch(fetchMock);
    setFxNow(() => NOW);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(TABLE_A));
  });

  afterEach(() => {
    resetFxInflight();
    setFxFetch(null);
    setFxNow(null);
  });

  it("converts from the cached rate", async () => {
    seedCache();
    await expect(convertEventBudget(100, "PLN")).resolves.toEqual({
      EUR: 23,
      PLN: 100,
      JPY: 4000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a decimal primary amount", async () => {
    seedCache();
    await expect(convertEventBudget(1.2, "PLN")).resolves.toMatchObject({
      PLN: 1.2,
    });
  });

  it("converts zero in every currency", async () => {
    seedCache();
    for (const currency of ["EUR", "PLN", "JPY"]) {
      await expect(convertEventBudget(0, currency)).resolves.toEqual({
        EUR: 0,
        PLN: 0,
        JPY: 0,
      });
    }
  });

  it("rejects an invalid amount or currency", async () => {
    await expect(convertEventBudget(-1, "PLN")).rejects.toMatchObject({
      name: "DomainError",
      status: 400,
      message: "Invalid amount or currency.",
    });
    await expect(convertEventBudget(Number.NaN, "EUR")).rejects.toMatchObject({
      status: 400,
    });
    await expect(convertEventBudget(Infinity, "EUR")).rejects.toMatchObject({
      status: 400,
    });
    await expect(convertEventBudget(10, "GBP")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws when conversion overflows", async () => {
    seedCache();
    await expect(convertEventBudget(Number.MAX_VALUE, "EUR")).rejects.toMatchObject({
      name: "DomainError",
      status: 503,
    });
  });
});
