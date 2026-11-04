import { vi } from "vitest";
import type { User } from "@/lib/db/schema";
import { makeUser } from "@/test/helpers/fixtures";

/** Factory for `vi.mock("@/lib/session", async () => sessionMockModule())`. */
export function sessionMockModule() {
  return {
    getCurrentUser: vi.fn(),
    getGuestInEvent: vi.fn(),
  };
}

async function session() {
  return import("@/lib/session");
}

export async function asAdmin(overrides: Partial<User> = {}) {
  const { getCurrentUser } = await session();
  const user = makeUser({ ...overrides, role: "admin" });
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  return user;
}

export async function asUser(overrides: Partial<User> = {}) {
  const { getCurrentUser } = await session();
  const user = makeUser({ role: "user", ...overrides });
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  return user;
}

export async function asAnonymous() {
  const { getCurrentUser } = await session();
  vi.mocked(getCurrentUser).mockResolvedValue(null);
}
