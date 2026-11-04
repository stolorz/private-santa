/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDelivery, type RevealLink } from "@/lib/delivery-status";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { GuestRevealLinks } from "@/components/event-admin/guest-reveal-links";

function link(overrides: Partial<RevealLink> & Pick<RevealLink, "giver" | "token">): RevealLink {
  return {
    url: `https://example.test/${overrides.token}`,
    delivered: emptyDelivery(),
    emailFailed: false,
    emailFailedReason: null,
    opened: false,
    revealed: false,
    hasWishlist: false,
    matchWishlist: "none",
    blockedReason: null,
    ...overrides,
  };
}

function ok(data: unknown) {
  return { ok: true, data, error: null, status: 200 };
}

const ada = link({ giver: "Ada", token: "adaadaadaada" });
const bea = link({ giver: "Bea", token: "beabeabeabea" });

describe("GuestRevealLinks", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    onRefresh.mockReset();
    requestJson.mockReset();
  });

  it("does not restore a removed pair when links props go stale", async () => {
    const user = userEvent.setup();
    requestJson.mockResolvedValue(ok({}));
    const { rerender } = render(
      <GuestRevealLinks code="abcdef" links={[ada, bea]} onRefresh={onRefresh} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Remove Ada's pair" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove pair" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.getByText("Bea")).toBeTruthy();

    rerender(
      <GuestRevealLinks code="abcdef" links={[ada, bea]} onRefresh={onRefresh} />,
    );
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.getByText("Bea")).toBeTruthy();
  });

  it("keeps a saved delivery flag when links props go stale", async () => {
    const user = userEvent.setup();
    const saved = { ...emptyDelivery(), manual: true };
    requestJson.mockResolvedValue(ok({ delivered: saved }));
    const { rerender } = render(
      <GuestRevealLinks code="abcdef" links={[ada]} onRefresh={onRefresh} />,
    );

    await user.click(screen.getByRole("button", { name: "Not delivered" }));
    await user.click(screen.getByRole("switch", { name: /Manual/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "Delivered via Manual" }),
    ).toBeTruthy();

    rerender(
      <GuestRevealLinks code="abcdef" links={[ada]} onRefresh={onRefresh} />,
    );
    expect(
      screen.getByRole("button", { name: "Delivered via Manual" }),
    ).toBeTruthy();
  });

  it("keeps the reveal link inactive and hidden when send data is missing", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const reason =
      "The link to the reveal page cannot be generated because this guest's gender is not defined.";
    const blocked = link({
      giver: "Ada",
      token: "adaadaadaada",
      blockedReason: reason,
    });
    render(
      <GuestRevealLinks code="abcdef" links={[blocked]} onRefresh={onRefresh} />,
    );

    const button = screen.getByRole("button", { name: reason });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.queryByText(blocked.url)).toBeNull();

    await user.hover(button.parentElement!);
    expect((await screen.findByRole("tooltip")).textContent).toBe(reason);
    await user.click(button.parentElement!);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies a reveal link when nothing blocks send", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <GuestRevealLinks code="abcdef" links={[ada]} onRefresh={onRefresh} />,
    );

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(ada.url);
  });
});
