import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeUser } from "@/test/helpers/fixtures";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRegisteredUser, requireAdminPage } from "@/lib/session";

const getSession = vi.mocked(auth.api.getSession);

function sessionFor(user: ReturnType<typeof makeUser> | null) {
  if (!user) return null;
  return {
    user,
    session: {
      id: "sess_1",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      userId: user.id,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      token: "session-token",
    },
  };
}

describe("hasRegisteredUser", () => {
  it("is false when no users exist", async () => {
    expect(await hasRegisteredUser()).toBe(false);
  });

  it("treats a missing count row as zero", async () => {
    vi.spyOn(db, "select").mockReturnValue({
      from: async () => [],
    } as never);
    expect(await hasRegisteredUser()).toBe(false);
  });

  it("is true once a user row exists", async () => {
    mockDb.seed(schema.user, [makeUser()]);
    expect(await hasRegisteredUser()).toBe(true);
  });
});

describe("requireAdminPage", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("redirects anonymous visitors to login", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects signed-in non-admins to events", async () => {
    getSession.mockResolvedValue(sessionFor(makeUser({ role: "user" })));
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/events");
  });

  it("returns the current admin", async () => {
    const user = makeUser({ role: "admin" });
    getSession.mockResolvedValue(sessionFor(user));
    await expect(requireAdminPage()).resolves.toMatchObject({
      id: user.id,
      role: "admin",
    });
  });
});
