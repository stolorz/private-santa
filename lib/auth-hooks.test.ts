import { describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeUser } from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { afterCreateUser, beforeCreateUser } from "@/lib/auth-hooks";
import { ORGANISER_SIGNUP_UNAVAILABLE } from "@/lib/auth-role";
import { setPendingOrganiser, takePendingOrganiser } from "@/lib/signup-pending";

describe("beforeCreateUser", () => {
  it("promotes the first user to admin", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    const result = await beforeCreateUser({
      email: "ada@example.com",
      name: "Ada",
    });
    expect(result.data).toMatchObject({
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
    });
  });

  it("rejects a first user whose email does not match ADMIN_EMAIL", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ada@example.com");
    await expect(
      beforeCreateUser({ email: "bea@example.com", name: "Bea" }),
    ).rejects.toThrow(ORGANISER_SIGNUP_UNAVAILABLE);
  });

  it("rejects signup in production when ADMIN_EMAIL is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAIL", "");
    await expect(
      beforeCreateUser({ email: "ada@example.com", name: "Ada" }),
    ).rejects.toThrow(ORGANISER_SIGNUP_UNAVAILABLE);
  });

  it("rejects signup after the first user exists", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    mockDb.seed(schema.user, [makeUser({ id: "admin_1", role: "admin" })]);
    await expect(
      beforeCreateUser({ email: "bea@example.com", name: "Bea" }),
    ).rejects.toThrow("An organiser already exists. Log in instead.");
  });
});

describe("afterCreateUser", () => {
  it("inserts the pending organiser person", async () => {
    takePendingOrganiser();
    mockDb.seed(schema.user, [
      makeUser({ id: "user_ada", name: "Ada Lovelace", email: "ada@example.com" }),
    ]);
    setPendingOrganiser({
      name: "Ada Lovelace",
      phone: "351912345678",
      email: "ada@example.com",
    });

    await afterCreateUser({ id: "user_ada" });

    expect(mockDb.rows(schema.person)).toEqual([
      expect.objectContaining({
        userId: "user_ada",
        name: "Ada Lovelace",
        nameNormalized: "ada lovelace",
        phone: "351912345678",
        email: "ada@example.com",
      }),
    ]);
    expect(takePendingOrganiser()).toBeNull();
  });

  it("no-ops when nothing is pending", async () => {
    takePendingOrganiser();
    await afterCreateUser({ id: "user_ada" });
    expect(mockDb.rows(schema.person)).toEqual([]);
  });
});
