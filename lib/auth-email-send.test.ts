import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTransactionalEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmail(...args),
}));

import {
  sendBetterAuthVerificationEmail,
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
      subject: "Confirm your Secret Santa organiser account",
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
