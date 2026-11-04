import { describe, expect, it } from "vitest";
import {
  isUnverifiedEmailError,
  organiserNeedsEmailVerification,
  UNVERIFIED_EMAIL_LOGIN_MESSAGE,
} from "@/lib/auth-email";

describe("organiserNeedsEmailVerification", () => {
  it("is false until host, user, password and from are all set", () => {
    expect(organiserNeedsEmailVerification({})).toBe(false);
    expect(
      organiserNeedsEmailVerification({
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "santa@example.com",
        SMTP_PASS: "",
        SMTP_FROM: "Santa <santa@example.com>",
      }),
    ).toBe(false);
  });

  it("is true when the four env fields are present", () => {
    expect(
      organiserNeedsEmailVerification({
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "santa@example.com",
        SMTP_PASS: "secret",
        SMTP_FROM: "Santa <santa@example.com>",
      }),
    ).toBe(true);
  });
});

describe("isUnverifiedEmailError", () => {
  it("detects the Better Auth code and message", () => {
    expect(isUnverifiedEmailError(null)).toBe(false);
    expect(isUnverifiedEmailError({ code: "EMAIL_NOT_VERIFIED" })).toBe(true);
    expect(isUnverifiedEmailError({ message: "Email not verified" })).toBe(
      true,
    );
    expect(
      isUnverifiedEmailError({ message: "Invalid email or password" }),
    ).toBe(false);
    expect(isUnverifiedEmailError({ code: "OTHER" })).toBe(false);
    expect(UNVERIFIED_EMAIL_LOGIN_MESSAGE).toMatch(/email/);
  });
});
