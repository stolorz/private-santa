/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDraw, makeGuestView } from "@/test/helpers/fixtures";

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

import { DrawTab } from "@/components/event-admin/draw-tab";

function ok(data: unknown) {
  return { ok: true, data, error: null, status: 200 };
}

const guests = [
  makeGuestView({ id: 1, name: "Ada" }),
  makeGuestView({ id: 2, name: "Bea" }),
];

describe("DrawTab", () => {
  beforeEach(() => {
    refresh.mockReset();
    requestJson.mockReset();
  });

  it("opens the confirm dialog and runs the draw without sending flags", async () => {
    const user = userEvent.setup();
    requestJson.mockResolvedValue(ok({ draw: makeDraw(), assignments: 2 }));
    render(
      <DrawTab
        code="abcdef"
        guests={guests}
        exclusions={[]}
        currentDraw={null}
        hasPastEditions={false}
        allowSelfDraw={false}
        avoidPastPairings={false}
        occursOn="2026-12-24"
      />,
    );
    expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
    expect(screen.queryByText("Draw options")).toBeNull();
    expect(screen.queryByText("Automatic exclusions")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Run draw/ }));
    expect(screen.getByText("Run the draw?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    expect(requestJson).toHaveBeenCalledWith(
      expect.stringContaining("/draw"),
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = requestJson.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows current draw stats when pairs exist", () => {
    render(
      <DrawTab
        code="abcdef"
        guests={guests}
        exclusions={[]}
        currentDraw={{
          draw: makeDraw({ name: "Xmas draw", durationMs: 12, attempts: 1 }),
          revealLinks: [],
          assignedGiverIds: [1, 2],
          assignedReceiverIds: [2, 1],
        }}
        hasPastEditions
        allowSelfDraw={false}
        avoidPastPairings
        occursOn="2026-12-24"
      />,
    );
    expect(screen.getByText(/Xmas draw/)).toBeTruthy();
    expect(screen.getByText("Everyone already has someone to give to.")).toBeTruthy();
    const download = screen.getByRole("link", { name: "Export CSV" });
    expect(download.getAttribute("href")).toBe("/api/e/abcdef/draw/results");
    expect(download.getAttribute("download")).toBe("draw_results_2026.csv");
  });

  it("uses a yearless download name when the party date is not a real day", () => {
    render(
      <DrawTab
        code="abcdef"
        guests={guests}
        exclusions={[]}
        currentDraw={{
          draw: makeDraw(),
          revealLinks: [],
          assignedGiverIds: [1],
          assignedReceiverIds: [2],
        }}
        hasPastEditions={false}
        allowSelfDraw={false}
        avoidPastPairings={false}
        occursOn="2026-02-31"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Export CSV" }).getAttribute("download"),
    ).toBe("draw_results.csv");
  });
});
