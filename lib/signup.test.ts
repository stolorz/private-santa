import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeUser } from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { ORGANISER_SIGNUP_UNAVAILABLE } from "@/lib/auth-role";
import { DomainError } from "@/lib/errors";
import { optionalPhoneSchema } from "@/lib/schemas";
import { signupFirstOrganiser } from "@/lib/signup";
import { takePendingOrganiser } from "@/lib/signup-pending";

const signUpEmail = vi.mocked(auth.api.signUpEmail);

function mockCreatedUser(id: string) {
  signUpEmail.mockImplementation(async () => {
    mockDb.add(schema.user, makeUser({ id, name: "Ada", email: "ada@example.com" }));
    return { user: { id } } as never;
  });
}

describe("signupFirstOrganiser", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    takePendingOrganiser();
    vi.stubEnv("ADMIN_EMAIL", "");
  });

  afterEach(() => {
    takePendingOrganiser();
  });

  it("creates a person for the first organiser", async () => {
    mockCreatedUser("user_ada");

    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "Ada@Example.com",
        password: "password1",
        phone: "+351 912 345 678",
      }),
    ).resolves.toEqual({ needsVerification: false });

    expect(mockDb.rows(schema.person)).toEqual([
      expect.objectContaining({
        userId: "user_ada",
        name: "Ada",
        phone: "351912345678",
        email: "ada@example.com",
      }),
    ]);
    expect(takePendingOrganiser()).toBeNull();
  });

  it("rejects a first user who does not match ADMIN_EMAIL", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ada@example.com");
    await expect(
      signupFirstOrganiser({
        name: "Bea",
        email: "bea@example.com",
        password: "password1",
      }),
    ).rejects.toThrow(ORGANISER_SIGNUP_UNAVAILABLE);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects signup in production when ADMIN_EMAIL is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAIL", "");
    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
      }),
    ).rejects.toThrow(ORGANISER_SIGNUP_UNAVAILABLE);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("reports needsVerification when env SMTP is configured", async () => {
    mockCreatedUser("user_ada");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "santa@example.com");
    vi.stubEnv("SMTP_PASS", "secret");
    vi.stubEnv("SMTP_FROM", "Santa <santa@example.com>");
    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
      }),
    ).resolves.toEqual({ needsVerification: true });
  });

  it("rejects a second organiser", async () => {
    mockDb.seed(schema.user, [makeUser({ id: "admin_1", role: "admin" })]);

    await expect(
      signupFirstOrganiser({
        name: "Bea",
        email: "bea@example.com",
        password: "password1",
      }),
    ).rejects.toThrow(DomainError);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("falls back when a phone schema error has no issue message", async () => {
    vi.spyOn(optionalPhoneSchema, "safeParse").mockReturnValueOnce({
      success: false,
      error: { issues: [] },
    } as never);
    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
        phone: "351912345678",
      }),
    ).rejects.toThrow("Invalid phone number.");
  });

  it("rejects a phone that is empty after digitsOnly", async () => {
    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
        phone: "+++",
      }),
    ).rejects.toThrow("Invalid phone number.");
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("wraps a non-Error throw from Better Auth", async () => {
    signUpEmail.mockRejectedValue("nope");
    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
      }),
    ).rejects.toThrow("Could not create account.");
    expect(takePendingOrganiser()).toBeNull();
  });

  it("skips the person row when pending state is already gone", async () => {
    const pending = await import("@/lib/signup-pending");
    mockCreatedUser("user_ada");
    vi.spyOn(pending, "takePendingOrganiser").mockReturnValueOnce(null);
    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
      }),
    ).resolves.toEqual({ needsVerification: false });
    expect(mockDb.rows(schema.person)).toEqual([]);
  });

  it("clears pending state when Better Auth throws", async () => {
    signUpEmail.mockRejectedValue(new Error("User already exists"));

    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
      }),
    ).rejects.toThrow("User already exists");

    expect(takePendingOrganiser()).toBeNull();
    expect(mockDb.rows(schema.person)).toEqual([]);
  });

  it("clears pending state when Better Auth returns no user id", async () => {
    signUpEmail.mockResolvedValue({ user: {} } as never);

    await expect(
      signupFirstOrganiser({
        name: "Ada",
        email: "ada@example.com",
        password: "password1",
      }),
    ).rejects.toThrow("Could not create account.");

    expect(takePendingOrganiser()).toBeNull();
  });
});
