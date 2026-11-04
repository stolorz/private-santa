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
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { SafetySettings } from "@/components/settings/safety-settings";

describe("SafetySettings", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    requestJson.mockReset();
  });

  it("shows which env var is in use", () => {
    render(
      <SafetySettings
        initial={{ source: "BETTER_AUTH_SECRET", weak: false }}
      />,
    );
    expect(screen.getByText("Currently using BETTER_AUTH_SECRET.")).toBeTruthy();
    expect(screen.queryByText(/example placeholder/)).toBeNull();
  });

  it("warns when the secret is weak", () => {
    render(
      <SafetySettings initial={{ source: "AUTH_SECRET", weak: true }} />,
    );
    expect(screen.getByText("Currently using AUTH_SECRET.")).toBeTruthy();
    expect(screen.getByText(/example placeholder/)).toBeTruthy();
  });

  it("explains the built-in default", () => {
    render(<SafetySettings initial={{ source: "default", weak: true }} />);
    expect(
      screen.getByText(/Using Better Auth's built-in default/),
    ).toBeTruthy();
  });

  it("does not POST until the confirm dialog is accepted", async () => {
    const user = userEvent.setup();
    requestJson.mockResolvedValue({
      ok: true,
      data: { ok: true, source: "BETTER_AUTH_SECRET", weak: false },
      error: null,
      status: 200,
    });

    render(
      <SafetySettings
        initial={{ source: "BETTER_AUTH_SECRET", weak: false }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Generate new secret" }),
    );
    expect(screen.getByText("Generate a new auth secret?")).toBeTruthy();
    expect(requestJson).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Generate a new auth secret?")).toBeNull();
    expect(requestJson).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Generate new secret" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Generate and sign out" }),
    );

    await waitFor(() => {
      expect(requestJson).toHaveBeenCalledTimes(1);
    });
    expect(requestJson.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/login");
      expect(refresh).toHaveBeenCalled();
    });
  });
});
