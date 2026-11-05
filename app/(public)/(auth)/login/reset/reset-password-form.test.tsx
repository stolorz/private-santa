/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPassword = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  resetPassword: (...args: unknown[]) => resetPassword(...args),
}));

import { ResetPasswordForm } from "./reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    resetPassword.mockReset();
  });

  it("explains a missing token", () => {
    render(<ResetPasswordForm token="" errorCode="" />);
    expect(
      screen.getByText("This reset link is invalid or has expired."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Request another" }).getAttribute("href"),
    ).toBe("/login/forgot");
  });

  it("treats a whitespace-only token as a broken link", () => {
    render(<ResetPasswordForm token="   " errorCode="  " />);
    expect(
      screen.getByText("This reset link is invalid or has expired."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("explains an invalid token from the email redirect", () => {
    render(<ResetPasswordForm token="abc" errorCode="INVALID_TOKEN" />);
    expect(
      screen.getByText("This reset link is invalid or has expired."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("keeps submit disabled until the passwords match", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" errorCode="" />);
    await user.type(screen.getByLabelText("New password"), "password1");
    await user.type(screen.getByLabelText("Confirm password"), "password2");
    const button = screen.getByRole("button", { name: "Update password" });
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("Those passwords do not match.")).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("refuses a password shorter than 8 characters", async () => {
    resetPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" errorCode="" />);
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => {
      expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    });
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("updates the password and links back to log in", async () => {
    resetPassword.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" errorCode="" />);
    await user.type(screen.getByLabelText("New password"), "password1");
    await user.type(screen.getByLabelText("Confirm password"), "password1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => {
      expect(screen.getByText("Password updated")).toBeTruthy();
    });
    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: "password1",
      token: "abc",
    });
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("explains an invalid token returned by the reset", async () => {
    resetPassword.mockResolvedValue({
      error: { message: "Invalid token" },
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" errorCode="" />);
    await user.type(screen.getByLabelText("New password"), "password1");
    await user.type(screen.getByLabelText("Confirm password"), "password1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => {
      expect(
        screen.getByText("This reset link is invalid or has expired."),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Password updated")).toBeNull();
  });

  it("shows the client error when the reset fails", async () => {
    resetPassword.mockResolvedValue({
      error: { message: "Password too short" },
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" errorCode="" />);
    await user.type(screen.getByLabelText("New password"), "password1");
    await user.type(screen.getByLabelText("Confirm password"), "password1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => {
      expect(screen.getByText("Password too short")).toBeTruthy();
    });
    expect(screen.queryByText("Password updated")).toBeNull();
  });

  it("uses a fallback when the client error has no message", async () => {
    resetPassword.mockResolvedValue({ error: { error: 1 } });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="abc" errorCode="" />);
    await user.type(screen.getByLabelText("New password"), "password1");
    await user.type(screen.getByLabelText("Confirm password"), "password1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => {
      expect(screen.getByText("Could not update the password.")).toBeTruthy();
    });
  });
});
