/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const signOut = vi.fn(async () => {});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: () => signOut(),
}));

import { SignOutButton } from "@/components/layout/sign-out-button";

describe("SignOutButton", () => {
  it("signs out and returns to the home page", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalled();
  });
});
