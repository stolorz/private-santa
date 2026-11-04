/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({ body: JSON.stringify(body) }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { SignupForm } from "./signup-form";

describe("SignupForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    requestJson.mockReset();
  });

  it("goes to events when verification is not required", async () => {
    requestJson.mockResolvedValue({
      ok: true,
      data: { ok: true, needsVerification: false },
      error: null,
      status: 200,
    });
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/events");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("asks the organiser to check their inbox when verification is required", async () => {
    requestJson.mockResolvedValue({
      ok: true,
      data: { ok: true, needsVerification: true },
      error: null,
      status: 200,
    });
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeTruthy();
    });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });
});
