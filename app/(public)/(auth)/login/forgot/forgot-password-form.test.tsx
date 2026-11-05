/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestPasswordReset = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
}));

import { ForgotPasswordForm } from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
  });

  it("asks the organiser to check their email", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeTruthy();
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "ada@example.com",
      redirectTo: "/login/reset",
    });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("trims the email before requesting a reset", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "  ada@example.com  ");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith({
        email: "ada@example.com",
        redirectTo: "/login/reset",
      });
    });
  });

  it("includes the base path in the reset redirect", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/santa");
    requestPasswordReset.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith({
        email: "ada@example.com",
        redirectTo: "/santa/login/reset",
      });
    });
  });

  it("shows the client error message", async () => {
    requestPasswordReset.mockResolvedValue({
      error: { message: "Reset password isn't enabled" },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(screen.getByText("Reset password isn't enabled")).toBeTruthy();
    });
    expect(screen.queryByText("Check your email")).toBeNull();
  });

  it("shows a rate-limit error from the response body", async () => {
    requestPasswordReset.mockResolvedValue({
      error: { error: "Too many requests. Try again later." },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(
        screen.getByText("Too many requests. Try again later."),
      ).toBeTruthy();
    });
  });

  it("uses a fallback when the client error has no message", async () => {
    requestPasswordReset.mockResolvedValue({ error: {} });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => {
      expect(screen.getByText("Could not send a reset link.")).toBeTruthy();
    });
  });
});
