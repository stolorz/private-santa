import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { OG_DEFAULTS, type OgSettings } from "@/lib/og";
import { processSingleton } from "@/lib/process-singleton";

type CacheSlot = {
  loaded: boolean;
  cache: unknown;
  generation: number;
  watched: Set<string>;
};

type SettingMapLoad = (keys: string[]) => Promise<Map<string, string>>;

let loadSettingMap: SettingMapLoad | null = null;

function settingCaches(): Map<string, CacheSlot> {
  return processSingleton("__santaSettingCaches", () => new Map());
}

function slotId(keys: string[]): string {
  return [...keys].sort().join("\0");
}

function ensureSlot(keys: string[]): CacheSlot {
  const caches = settingCaches();
  const id = slotId(keys);
  const existing = caches.get(id);
  if (existing) return existing;
  const created: CacheSlot = {
    loaded: false,
    cache: undefined,
    generation: 0,
    watched: new Set(keys),
  };
  caches.set(id, created);
  return created;
}

function notifySettingsWrite(keys?: string[]) {
  for (const slot of settingCaches().values()) {
    if (!keys || keys.some((key) => slot.watched.has(key))) {
      slot.loaded = false;
      slot.cache = undefined;
      slot.generation += 1;
    }
  }
}

function readSettingMap(keys: string[]): Promise<Map<string, string>> {
  return (loadSettingMap ?? getSettingMap)(keys);
}

/**
 * Cache a parsed setting until a watched key is written. Slots live on
 * `globalThis` so a Route Handler write invalidates the RSC reader.
 * An in-flight read that started before a write is dropped, not stored.
 */
export function cachedSetting<T>(
  keys: string[],
  parse: (stored: Map<string, string>) => T,
): () => Promise<T> {
  ensureSlot(keys);
  return async () => {
    while (true) {
      const slot = ensureSlot(keys);
      if (slot.loaded) return slot.cache as T;
      const gen = slot.generation;
      const parsed = parse(await readSettingMap(keys));
      if (gen !== slot.generation) continue;
      slot.cache = parsed;
      slot.loaded = true;
      return parsed;
    }
  };
}

/** Test hook: replace the KV read used by {@link cachedSetting}. */
export function setSettingMapLoad(fn: SettingMapLoad | null): void {
  loadSettingMap = fn;
}

export function resetSettingsCache(): void {
  notifySettingsWrite();
  loadSettingMap = null;
}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message);
}

/**
 * Read a set of app_setting keys. Missing keys and empty values are omitted
 * so callers can apply their own defaults. Only "no such table" is
 * swallowed (pre-migration build); every other database error is rethrown.
 */
export async function getSettingMap(
  keys: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (keys.length === 0) return out;
  try {
    const rows = await db
      .select()
      .from(schema.appSetting)
      .where(inArray(schema.appSetting.key, keys));
    for (const r of rows) {
      if (r.value != null && r.value !== "") out.set(r.key, r.value);
    }
  } catch (error) {
    if (isMissingTableError(error)) return out;
    throw error;
  }
  return out;
}

/**
 * Upsert non-empty values. Blank / null / undefined deletes the key.
 */
export async function setSettingMap(
  entries: Record<string, string | null | undefined>,
) {
  const toWrite: Array<{ key: string; value: string }> = [];
  const toDelete: string[] = [];
  for (const [key, raw] of Object.entries(entries)) {
    const value = raw ?? "";
    if (value.trim() === "") {
      toDelete.push(key);
      continue;
    }
    toWrite.push({ key, value });
  }
  db.transaction((tx) => {
    for (const { key, value } of toWrite) {
      tx.insert(schema.appSetting)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.appSetting.key,
          set: { value, updatedAt: new Date() },
        })
        .run();
    }
    if (toDelete.length > 0) {
      tx.delete(schema.appSetting)
        .where(inArray(schema.appSetting.key, toDelete))
        .run();
    }
  });
  const touched = [...toWrite.map((entry) => entry.key), ...toDelete];
  if (touched.length > 0) notifySettingsWrite(touched);
}

export { OG_DEFAULTS, type OgSettings } from "@/lib/og";

const OG_KEYS = Object.keys(OG_DEFAULTS) as Array<keyof OgSettings>;

const PREFIX = "og.";

/**
 * Read OG settings, merged over defaults. Resilient by design: returns
 * defaults if the DB is unreachable or the table doesn't exist yet. This
 * matters because the root `generateMetadata` calls it during static
 * prerender / `next build`, where the SQLite file may be absent or
 * migrations unapplied — it must never fail the build.
 */
const loadOgSettings = cachedSetting(
  OG_KEYS.map((k) => PREFIX + k),
  (stored) => {
    const out: OgSettings = { ...OG_DEFAULTS };
    for (const k of OG_KEYS) {
      const value = stored.get(PREFIX + k);
      if (value != null) out[k] = value;
    }
    return out;
  },
);

export async function getOgSettings(): Promise<OgSettings> {
  try {
    return await loadOgSettings();
  } catch {
    // Defaults are fine; the table may not exist yet (pre-migration build).
    return { ...OG_DEFAULTS };
  }
}
