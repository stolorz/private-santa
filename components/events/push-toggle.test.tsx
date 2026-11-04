/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { PushToggle } from "@/components/events/push-toggle";

const VAPID = "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("PushToggle", () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it("renders nothing without PushManager", () => {
    const { container } = render(<PushToggle publicKey={VAPID} />);
    expect(container.textContent).toBe("");
  });

  it("enables notifications when permission is granted", async () => {
    const subscribe = vi.fn(async () => ({
      toJSON: () => ({ endpoint: "https://push.example/1" }),
      unsubscribe: vi.fn(),
      options: { applicationServerKey: null },
    }));
    const getSubscription = vi.fn(async () => null);
    const registration = {
      update: vi.fn(async () => {}),
      pushManager: { getSubscription, subscribe },
    };
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: vi.fn(async () => registration),
        ready: Promise.resolve(registration),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    Object.defineProperty(globalThis, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: { requestPermission: vi.fn(async () => "granted") },
    });
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });

    const user = userEvent.setup();
    render(<PushToggle publicKey={VAPID} hint="Get a ping." />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enable push notifications" }),
      ).toBeTruthy(),
    );
    await user.click(
      screen.getByRole("button", { name: "Enable push notifications" }),
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalled());
    expect(screen.getByText("Get a ping.")).toBeTruthy();
  });
});
