import { describe, expect, it } from "vitest";
import { organiserSignupAllowed } from "@/lib/auth-role";

describe("organiserSignupAllowed", () => {
  it("allows any first address in development when ADMIN_EMAIL is unset", () => {
    expect(
      organiserSignupAllowed("ada@example.com", { NODE_ENV: "development" }),
    ).toBe(true);
    expect(
      organiserSignupAllowed("ada@example.com", {
        NODE_ENV: "test",
        ADMIN_EMAIL: "  ",
      }),
    ).toBe(true);
  });

  it("requires a match when ADMIN_EMAIL is set", () => {
    const env = { ADMIN_EMAIL: "Ada@Example.com", NODE_ENV: "test" };
    expect(organiserSignupAllowed("ada@example.com", env)).toBe(true);
    expect(organiserSignupAllowed("  ADA@example.com  ", env)).toBe(true);
    expect(organiserSignupAllowed("bea@example.com", env)).toBe(false);
  });

  it("refuses signup in production when ADMIN_EMAIL is blank", () => {
    expect(
      organiserSignupAllowed("ada@example.com", { NODE_ENV: "production" }),
    ).toBe(false);
    expect(
      organiserSignupAllowed("ada@example.com", {
        NODE_ENV: "production",
        ADMIN_EMAIL: "ada@example.com",
      }),
    ).toBe(true);
  });
});
