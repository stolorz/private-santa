/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeEvent, makeSeries } from "@/test/helpers/fixtures";
import type { JsonResult } from "@/lib/fetch-json";

const refresh = vi.fn();
const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { EventsManager } from "@/components/events/events-manager";

function ok<T>(data: T): JsonResult<T> {
  return { ok: true, data, error: null, status: 200 };
}

const groups = [
  {
    series: makeSeries(),
    editions: [{ ...makeEvent(), problemCount: 0 }],
  },
];

const impact = {
  guests: 2,
  wishlists: 0,
  exclusions: 0,
  draftDraws: 0,
  completedDraws: 0,
  otherEditions: 1,
};

function lastDeleteCall() {
  return requestJson.mock.calls
    .filter((call) => (call[1] as RequestInit | undefined)?.method === "DELETE")
    .at(-1);
}

function mockImpact(overrides?: {
  completedDraws?: number;
  guests?: Array<{ personId: number; name: string; exclusive: boolean }>;
}) {
  requestJson.mockReset();
  requestJson.mockImplementation(async (url: unknown, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return ok({ ok: true });
    }
    if (String(url).includes("/api/events/")) {
      return ok({
        series: { name: "Xmas" },
        impact: {
          ...impact,
          completedDraws: overrides?.completedDraws ?? 0,
          guests: (overrides?.guests ?? defaultGuests).length,
        },
        guests: overrides?.guests ?? defaultGuests,
      });
    }
    return ok({});
  });
}

const defaultGuests = [
  { personId: 1, name: "Ada", exclusive: true },
  { personId: 2, name: "Bea", exclusive: false },
];

describe("EventsManager problem count", () => {
  it("shows a red problem count and hides a zero", () => {
    render(
      <EventsManager
        groups={[
          {
            series: makeSeries(),
            editions: [
              { ...makeEvent(), problemCount: 2 },
              {
                ...makeEvent({ id: 2, code: "later1", name: "Later" }),
                problemCount: 0,
              },
              {
                ...makeEvent({ id: 3, code: "oneprob", name: "Solo" }),
                problemCount: 1,
              },
            ],
          },
        ]}
      />,
    );

    const many = screen.getByText("2 problems");
    const one = screen.getByText("1 problem");
    expect(many.className).toContain("text-destructive");
    expect(one.className).toContain("text-destructive");
    expect(screen.queryByText("0 problems")).toBeNull();
    expect(screen.getByRole("link", { name: /2 problems/ }).getAttribute("href")).toBe(
      "/e/xmas_20260101/admin",
    );
  });
});

describe("EventsManager delete dialog", () => {
  it("lists guests with exclusive checkboxes enabled and shared ones disabled", async () => {
    mockImpact();
    const user = userEvent.setup();
    render(<EventsManager groups={groups} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete this event permanently?")).toBeTruthy();

    const ada = await screen.findByRole("checkbox", { name: /Ada/ });
    const bea = screen.getByRole("checkbox", { name: /Bea/ });
    expect(ada).toHaveProperty("checked", false);
    expect(ada).toHaveProperty("disabled", false);
    expect(bea).toHaveProperty("checked", false);
    expect(bea).toHaveProperty("disabled", true);
    expect(screen.getByText("Also in another event")).toBeTruthy();
  });

  it("sends no person ids when none are checked", async () => {
    mockImpact();
    const user = userEvent.setup();
    render(<EventsManager groups={groups} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("checkbox", { name: /Ada/ });
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => {
      expect(lastDeleteCall()?.[1]).toMatchObject({
        method: "DELETE",
        body: JSON.stringify({ deletePersonIds: [] }),
      });
    });
  });

  it("sends checked exclusive person ids", async () => {
    mockImpact();
    const user = userEvent.setup();
    render(<EventsManager groups={groups} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("checkbox", { name: /Ada/ });
    await user.click(screen.getByText("Ada"));
    expect(screen.getByRole("checkbox", { name: /Ada/ })).toHaveProperty(
      "checked",
      true,
    );

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => {
      expect(lastDeleteCall()?.[1]).toMatchObject({
        method: "DELETE",
        body: JSON.stringify({ deletePersonIds: [1] }),
      });
    });
  });

  it("hides the guest list and blocks delete when a draw is completed", async () => {
    mockImpact({
      completedDraws: 1,
      guests: [{ personId: 1, name: "Ada", exclusive: true }],
    });
    const user = userEvent.setup();
    render(<EventsManager groups={groups} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      await screen.findByText(/cannot be deleted because a draw has already/),
    ).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Ada/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete permanently" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
