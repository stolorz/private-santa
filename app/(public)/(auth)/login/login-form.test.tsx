/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const signInEmail = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: {
    email: (...args: unknown[]) => signInEmail(...args),
  },
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    signInEmail.mockReset();
  });

  it("goes to events after a successful login", async () => {
    signInEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/events");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the sign-in error message", async () => {
    signInEmail.mockResolvedValue({
      error: { message: "Invalid email or password" },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeTruthy();
    });
    expect(push).not.toHaveBeenCalled();
  });
});
