/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeExclusion, makeGuestView } from "@/test/helpers/fixtures";

const refresh = vi.fn();
const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { ExclusionsTab } from "@/components/event-admin/exclusions-tab";

const guests = [
  makeGuestView({ id: 1, name: "Ada" }),
  makeGuestView({ id: 2, name: "Bea" }),
];

function renderTab(
  overrides: Partial<Parameters<typeof ExclusionsTab>[0]> = {},
) {
  return render(
    <ExclusionsTab
      code="abcdef"
      guests={guests}
      exclusions={[]}
      allowSelfDraw={false}
      avoidPastPairings={false}
      hasPastEditions={false}
      {...overrides}
    />,
  );
}

describe("ExclusionsTab", () => {
  beforeEach(() => {
    refresh.mockReset();
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
  });

  it("shows an empty state", () => {
    renderTab();
    expect(screen.getByText("No forbidden pairs.")).toBeTruthy();
    expect(screen.getByText("Automatic exclusions")).toBeTruthy();
  });

  it("removes an exclusion", async () => {
    const user = userEvent.setup();
    renderTab({
      exclusions: [makeExclusion({ id: 9, aId: 1, bId: 2 })],
    });
    expect(screen.getByText("Ada ⇄ Bea")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });

  it("saves disallow self-draw immediately", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("switch", { name: /Disallow self-draw/ }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const [, init] = requestJson.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ allowSelfDraw: true });
    expect(refresh).toHaveBeenCalled();
  });

  it("disables avoid past pairings when there is no earlier edition", () => {
    renderTab();
    expect(
      (
        screen.getByRole("switch", {
          name: /Avoid past pairings/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("tooltip", {
        name: "This event has no earlier editions, so there are no past pairings to avoid.",
      }),
    ).toBeTruthy();
  });

  it("saves avoid past pairings when earlier editions exist", async () => {
    const user = userEvent.setup();
    renderTab({ hasPastEditions: true });
    await user.click(screen.getByRole("switch", { name: /Avoid past pairings/ }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const [, init] = requestJson.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ avoidPastPairings: true });
  });

  it("shows an error when saving automatic exclusions fails", async () => {
    const user = userEvent.setup();
    requestJson.mockResolvedValue({
      ok: false,
      data: null,
      error: "Could not save.",
      status: 400,
    });
    renderTab();
    await user.click(screen.getByRole("switch", { name: /Disallow self-draw/ }));
    await waitFor(() =>
      expect(screen.getByText("Could not save.")).toBeTruthy(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
