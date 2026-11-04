import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSignalConfigured,
  markSignalLinked,
  signalStoreDir,
  unlinkSignal,
} from "@/lib/signal-store";

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("signal-store", () => {
  it("defaults to data/signal when SIGNAL_STORE_DIR is unset", () => {
    const prev = process.env.SIGNAL_STORE_DIR;
    delete process.env.SIGNAL_STORE_DIR;
    try {
      expect(signalStoreDir()).toBe("data/signal");
    } finally {
      if (prev !== undefined) process.env.SIGNAL_STORE_DIR = prev;
    }
  });

  it("writes and removes the linked marker in a temp dir", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "santa-signal-"));
    dirs.push(dir);
    vi.stubEnv("SIGNAL_STORE_DIR", dir);
    expect(isSignalConfigured()).toBe(false);
    markSignalLinked();
    expect(isSignalConfigured()).toBe(true);
    unlinkSignal();
    expect(isSignalConfigured()).toBe(false);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("refuses to delete the process cwd", () => {
    vi.stubEnv("SIGNAL_STORE_DIR", ".");
    expect(() => unlinkSignal()).toThrow(/unsafe/);
  });

  it("refuses to delete /", () => {
    vi.stubEnv("SIGNAL_STORE_DIR", "/");
    expect(() => unlinkSignal()).toThrow(/unsafe/);
  });
});
