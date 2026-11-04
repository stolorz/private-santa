import { afterEach, vi } from "vitest";
import { mockDb } from "./helpers/db";
import { resetRateLimit } from "@/lib/rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetRateLimit();
  mockDb.reset();
  const { resetSettingsCache } = await import("@/lib/settings");
  resetSettingsCache();
  const { resetTemplateDefaultsCache } = await import(
    "@/lib/templates/reference"
  );
  resetTemplateDefaultsCache();
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
