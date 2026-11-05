import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));

import {
  sendBetterAuthResetPassword,
  sendBetterAuthVerificationEmail,
  sendOrganiserResetPasswordEmail,
  sendOrganiserVerificationEmail,
} from "@/lib/auth-email-send";

describe("sendOrganiserVerificationEmail", () => {
  beforeEach(() => {
    sendTransactionalEmail.mockReset();
  });

  it("sends a confirmation link without a santa token", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: true,
    });
    await sendOrganiserVerificationEmail({
      to: "ada@example.com",
      url: "https://example.com/api/auth/verify-email?token=abc",
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith({
      to: "ada@example.com",
      subject: "Confirm your Private Santa organiser account",
      text: expect.stringContaining(
        "https://example.com/api/auth/verify-email?token=abc",
      ),
    });
  });

  it("throws when SMTP fails", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: false,
      error: "relay denied",
    });
    await expect(
      sendOrganiserVerificationEmail({
        to: "ada@example.com",
        url: "https://example.com/verify",
      }),
    ).rejects.toThrow("relay denied");
  });

  it("adapts Better Auth's user/url payload", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: true,
    });
    await sendBetterAuthVerificationEmail({
      user: { email: "ada@example.com" },
      url: "https://example.com/verify",
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ada@example.com" }),
    );
  });

  it("throws a fallback when SMTP fails without a reason", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: false,
    });
    await expect(
      sendOrganiserVerificationEmail({
        to: "ada@example.com",
        url: "https://example.com/verify",
      }),
    ).rejects.toThrow("Could not send verification email.");
  });
});

describe("sendOrganiserResetPasswordEmail", () => {
  beforeEach(() => {
    sendTransactionalEmail.mockReset();
  });

  it("sends the Better Auth link and an expiry note", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: true,
    });
    const url =
      "https://example.com/api/auth/reset-password/abc?callbackURL=%2Flogin%2Freset";
    await sendOrganiserResetPasswordEmail({
      to: "ada@example.com",
      url,
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith({
      to: "ada@example.com",
      subject: "Reset your Private Santa organiser password",
      text: `Open this link to choose a new password. It expires in one hour:\n\n${url}\n\nIf you did not ask for this, you can ignore this email.\n`,
    });
  });

  it("throws when SMTP fails", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: false,
      error: "relay denied",
    });
    await expect(
      sendOrganiserResetPasswordEmail({
        to: "ada@example.com",
        url: "https://example.com/reset",
      }),
    ).rejects.toThrow("relay denied");
  });

  it("throws a fallback when SMTP fails without a reason", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: false,
    });
    await expect(
      sendOrganiserResetPasswordEmail({
        to: "ada@example.com",
        url: "https://example.com/reset",
      }),
    ).rejects.toThrow("Could not send password reset email.");
  });

  it("adapts Better Auth's user/url payload", async () => {
    sendTransactionalEmail.mockResolvedValue({
      to: "ada@example.com",
      ok: true,
    });
    await sendBetterAuthResetPassword({
      user: { email: "ada@example.com" },
      url: "https://example.com/reset",
      token: "abc",
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        text: expect.stringContaining("https://example.com/reset"),
      }),
    );
  });
});
