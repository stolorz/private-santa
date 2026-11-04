import { describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeAppSetting } from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import {
  OG_DEFAULTS,
  cachedSetting,
  getOgSettings,
  getSettingMap,
  setSettingMap,
  setSettingMapLoad,
} from "@/lib/settings";

describe("getOgSettings", () => {
  it("merges stored values over OG_DEFAULTS", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "og.title", value: "Custom Santa" }),
      makeAppSetting({ key: "og.icon", value: "https://example.com/icon.png" }),
    ]);

    await expect(getOgSettings()).resolves.toEqual({
      ...OG_DEFAULTS,
      title: "Custom Santa",
      icon: "https://example.com/icon.png",
    });
  });

  it("ignores unknown keys", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "og.title", value: "Kept" }),
      makeAppSetting({ key: "og.unknown", value: "ignored" }),
      makeAppSetting({ key: "other", value: "nope" }),
    ]);

    const settings = await getOgSettings();

    expect(settings.title).toBe("Kept");
    expect(settings).toEqual({
      ...OG_DEFAULTS,
      title: "Kept",
    });
    expect(settings).not.toHaveProperty("unknown");
  });

  it("returns OG_DEFAULTS when the database throws", async () => {
    vi.spyOn(mockDb.db, "select").mockImplementation(() => {
      throw new Error("relation app_setting does not exist");
    });

    await expect(getOgSettings()).resolves.toEqual(OG_DEFAULTS);
  });
});

describe("getSettingMap / setSettingMap", () => {
  it("returns an empty map when no keys are requested", async () => {
    await expect(getSettingMap([])).resolves.toEqual(new Map());
  });

  it("omits empty stored values", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "wa.token", value: "tok" }),
      makeAppSetting({ key: "wa.phoneId", value: "" }),
    ]);

    await expect(getSettingMap(["wa.token", "wa.phoneId"])).resolves.toEqual(
      new Map([["wa.token", "tok"]]),
    );
  });

  it("upserts non-empty values and deletes blanks", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "email.from", value: "old@example.com" }),
      makeAppSetting({ key: "email.apiKey", value: "re_old" }),
    ]);

    await setSettingMap({
      "email.from": "Santa <santa@test.dev>",
      "email.apiKey": "",
    });

    const rows = mockDb.rows(schema.appSetting);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "email.from",
          value: "Santa <santa@test.dev>",
        }),
      ]),
    );
    expect(rows.some((r) => r.key === "email.apiKey")).toBe(false);
  });

  it("swallows missing-table errors", async () => {
    vi.spyOn(mockDb.db, "select").mockImplementation(() => {
      throw new Error("no such table: app_setting");
    });
    await expect(getSettingMap(["wa.token"])).resolves.toEqual(new Map());
  });

  it("swallows a missing-table throw that is not an Error", async () => {
    vi.spyOn(mockDb.db, "select").mockImplementation(() => {
      throw "no such table: app_setting";
    });
    await expect(getSettingMap(["wa.token"])).resolves.toEqual(new Map());
  });

  it("does not notify when nothing is written", async () => {
    await setSettingMap({});
    expect(mockDb.rows(schema.appSetting)).toEqual([]);
  });

  it("rethrows errors other than a missing table", async () => {
    vi.spyOn(mockDb.db, "select").mockImplementation(() => {
      throw new Error("SQLITE_BUSY");
    });
    await expect(getSettingMap(["wa.token"])).rejects.toThrow("SQLITE_BUSY");
  });

  it("keeps leading spaces on non-empty values", async () => {
    await setSettingMap({
      "note.leading": " The budget is {budget}.",
    });
    expect(mockDb.rows(schema.appSetting)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "note.leading",
          value: " The budget is {budget}.",
        }),
      ]),
    );
  });
});

describe("cachedSetting", () => {
  function reader(key: string) {
    return cachedSetting([key], (stored) => stored.get(key) ?? "");
  }

  it("keeps a stale DB row until a watched key is written", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "og.title", value: "First" }),
    ]);
    await expect(getOgSettings()).resolves.toMatchObject({ title: "First" });

    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "og.title", value: "Second" }),
    ]);
    await expect(getOgSettings()).resolves.toMatchObject({ title: "First" });

    await setSettingMap({ "og.title": "Third" });
    await expect(getOgSettings()).resolves.toMatchObject({ title: "Third" });
  });

  it("shares one slot across readers of the same keys", async () => {
    const a = reader("test.share");
    const b = reader("test.share");
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "test.share", value: "one" }),
    ]);
    await expect(a()).resolves.toBe("one");

    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "test.share", value: "two" }),
    ]);
    await expect(b()).resolves.toBe("one");
  });

  it("does not invalidate when a write touches other keys", async () => {
    const read = reader("test.keep");
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "test.keep", value: "kept" }),
      makeAppSetting({ key: "test.other", value: "x" }),
    ]);
    await expect(read()).resolves.toBe("kept");

    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "test.keep", value: "changed" }),
      makeAppSetting({ key: "test.other", value: "x" }),
    ]);
    await setSettingMap({ "test.other": "y" });
    await expect(read()).resolves.toBe("kept");
  });

  it("drops an in-flight read that finishes after a write", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "og.title", value: "Stale" }),
    ]);
    let release!: (value: Map<string, string>) => void;
    let loads = 0;
    setSettingMapLoad(async (keys) => {
      loads += 1;
      if (loads === 1) {
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return getSettingMap(keys);
    });

    const pending = getOgSettings();
    await setSettingMap({ "og.title": "Fresh" });
    release(new Map([["og.title", "Stale"]]));

    await expect(pending).resolves.toEqual({
      ...OG_DEFAULTS,
      title: "Fresh",
    });
    expect(loads).toBe(2);
    setSettingMapLoad(null);
  });
});

