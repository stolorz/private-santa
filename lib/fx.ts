import "server-only";
import {
  humanizeBudgetAmount,
  isCurrency,
  type Currency,
} from "@/lib/budget";
import { DomainError } from "@/lib/errors";
import { getSettingMap, setSettingMap } from "@/lib/settings";

export const FX_TTL_MS = 24 * 60 * 60 * 1000;
export const NBP_TABLE_A_URL =
  "https://api.nbp.pl/api/exchangerates/tables/a/?format=json";

export const FX_KEYS = {
  eurPln: "fx.nbp.eurPln",
  jpyPln: "fx.nbp.jpyPln",
  asOf: "fx.nbp.asOf",
  fetchedAt: "fx.nbp.fetchedAt",
} as const;

const EUR_BAND = { min: 3, max: 6 };
const JPY_BAND = { min: 0.01, max: 0.05 };
const FETCH_MS = 3_000;

export type FxRates = {
  eurPln: number;
  jpyPln: number;
  asOf: string;
};

export type ConvertedBudget = Record<Currency, number>;

type CachedFx = { rates: FxRates; fetchedAt: number };

type FetchImpl = typeof fetch;
type NowImpl = () => number;

function systemNow(): number {
  return Date.now();
}

let fetchImpl: FetchImpl = fetch;
let nowImpl: NowImpl = systemNow;
let inflight: Promise<FxRates> | null = null;
let memory: CachedFx | null = null;

export function setFxFetch(fn: FetchImpl | null): void {
  fetchImpl = fn ?? fetch;
}

export function setFxNow(fn: NowImpl | null): void {
  nowImpl = fn ?? systemNow;
}

export function resetFxInflight(): void {
  inflight = null;
  memory = null;
}

export function isPlausibleMid(code: "EUR" | "JPY", mid: number): boolean {
  if (!Number.isFinite(mid) || mid <= 0) return false;
  const band = code === "EUR" ? EUR_BAND : JPY_BAND;
  return mid >= band.min && mid <= band.max;
}

export function convertBudget(
  amount: number,
  currency: Currency,
  rates: Pick<FxRates, "eurPln" | "jpyPln">,
): ConvertedBudget | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (
    !isPlausibleMid("EUR", rates.eurPln) ||
    !isPlausibleMid("JPY", rates.jpyPln)
  ) {
    return null;
  }

  const plnPer: Record<Currency, number> = {
    EUR: rates.eurPln,
    JPY: rates.jpyPln,
    PLN: 1,
  };
  const pln = amount * plnPer[currency];
  if (!Number.isFinite(pln) || pln < 0) return null;

  const eur = currency === "EUR" ? amount : humanizeBudgetAmount(pln / rates.eurPln)!;
  const zloty = currency === "PLN" ? amount : humanizeBudgetAmount(pln)!;
  const yen = currency === "JPY" ? amount : humanizeBudgetAmount(pln / rates.jpyPln)!;
  return { EUR: eur, PLN: zloty, JPY: yen };
}

type NbpRate = { code?: unknown; mid?: unknown };
type NbpTable = {
  effectiveDate?: unknown;
  rates?: unknown;
};

export function parseNbpTableA(json: unknown): FxRates | null {
  const table = Array.isArray(json) ? json[0] : json;
  if (!table || typeof table !== "object") return null;
  const row = table as NbpTable;
  if (typeof row.effectiveDate !== "string" || !row.effectiveDate) return null;
  if (!Array.isArray(row.rates)) return null;

  let eurPln: number | null = null;
  let jpyPln: number | null = null;
  for (const entry of row.rates) {
    if (!entry || typeof entry !== "object") continue;
    const rate = entry as NbpRate;
    if (typeof rate.code !== "string" || typeof rate.mid !== "number") continue;
    if (rate.code === "EUR" && isPlausibleMid("EUR", rate.mid)) eurPln = rate.mid;
    if (rate.code === "JPY" && isPlausibleMid("JPY", rate.mid)) jpyPln = rate.mid;
  }
  if (eurPln == null || jpyPln == null) return null;
  return { eurPln, jpyPln, asOf: row.effectiveDate };
}

function parseCachedRates(stored: Map<string, string>): CachedFx | null {
  const eurPln = Number(stored.get(FX_KEYS.eurPln));
  const jpyPln = Number(stored.get(FX_KEYS.jpyPln));
  const asOf = stored.get(FX_KEYS.asOf);
  const fetchedAt = Date.parse(stored.get(FX_KEYS.fetchedAt) ?? "");
  if (
    !asOf ||
    !Number.isFinite(fetchedAt) ||
    !isPlausibleMid("EUR", eurPln) ||
    !isPlausibleMid("JPY", jpyPln)
  ) {
    return null;
  }
  return { rates: { eurPln, jpyPln, asOf }, fetchedAt };
}

async function readCache(): Promise<CachedFx | null> {
  return parseCachedRates(
    await getSettingMap([
      FX_KEYS.eurPln,
      FX_KEYS.jpyPln,
      FX_KEYS.asOf,
      FX_KEYS.fetchedAt,
    ]),
  );
}

async function writeCache(rates: FxRates, fetchedAt: number): Promise<void> {
  await setSettingMap({
    [FX_KEYS.eurPln]: String(rates.eurPln),
    [FX_KEYS.jpyPln]: String(rates.jpyPln),
    [FX_KEYS.asOf]: rates.asOf,
    [FX_KEYS.fetchedAt]: new Date(fetchedAt).toISOString(),
  });
}

async function fetchNbpRates(): Promise<FxRates | null> {
  try {
    const res = await fetchImpl(NBP_TABLE_A_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "secret-santa",
      },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return null;
    return parseNbpTableA(await res.json());
  } catch {
    return null;
  }
}

async function loadFxRates(): Promise<FxRates> {
  const cached = await readCache();
  if (cached && nowImpl() - cached.fetchedAt < FX_TTL_MS) {
    memory = cached;
    return cached.rates;
  }

  const fresh = await fetchNbpRates();
  if (fresh) {
    const fetchedAt = nowImpl();
    await writeCache(fresh, fetchedAt);
    memory = { rates: fresh, fetchedAt };
    return fresh;
  }
  if (cached) {
    memory = cached;
    return cached.rates;
  }
  throw new DomainError("Exchange rates are unavailable.", 503);
}

export async function getFxRates(): Promise<FxRates> {
  if (memory && nowImpl() - memory.fetchedAt < FX_TTL_MS) return memory.rates;
  if (inflight) return inflight;
  inflight = loadFxRates().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function convertEventBudget(
  amount: number,
  currency: string,
): Promise<ConvertedBudget> {
  if (!Number.isFinite(amount) || amount < 0 || !isCurrency(currency)) {
    throw new DomainError("Invalid amount or currency.", 400);
  }
  const rates = await getFxRates();
  const converted = convertBudget(amount, currency, rates);
  if (!converted) {
    throw new DomainError("Exchange rates are unavailable.", 503);
  }
  return converted;
}
