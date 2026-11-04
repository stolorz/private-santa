/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeGuestView, makePerson, polishNameCases } from "@/test/helpers/fixtures";
import type { PersonWithEvents } from "@/lib/people-types";

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
  postPhoto: vi.fn(),
  requestJson: (...args: unknown[]) => requestJson(...args),
  displayFetchError: (error: string | null, fallback: string) =>
    error || fallback,
}));

import { GuestsTab } from "@/components/event-admin/guests-tab";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function withEvents(
  person: ReturnType<typeof makePerson>,
  events: PersonWithEvents["events"] = [],
): PersonWithEvents {
  return { ...person, events };
}

function postedBody(): Record<string, unknown> {
  const init = requestJson.mock.calls.at(-1)?.[1] as { body?: string };
  return JSON.parse(init.body ?? "{}") as Record<string, unknown>;
}

describe("GuestsTab", () => {
  it("lists guests and opens the add form", async () => {
    const user = userEvent.setup();
    render(
      <GuestsTab
        code="abcdef"
        guests={[makeGuestView({ id: 1, name: "Ada" })]}
        otherEventSeats={{}}
        people={[withEvents(makePerson({ id: 1, name: "Ada" }))]}
      />,
    );
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("Gender is required.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /New guest/ }));
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/Enter the missing Polish cases/)).toBeTruthy();
  });

  it("does not flag a guest who already has a gender", () => {
    render(
      <GuestsTab
        code="abcdef"
        guests={[makeGuestView({ id: 1, name: "Ada", gender: "female" })]}
        otherEventSeats={{}}
        people={[
          withEvents(makePerson({ id: 1, name: "Ada", gender: "female" })),
        ]}
      />,
    );
    expect(screen.queryByText("Gender is required.")).toBeNull();
  });

  it("keeps case fields editable when an existing person is attached", async () => {
    const user = userEvent.setup();
    render(
      <GuestsTab
        code="abcdef"
        guests={[makeGuestView({ id: 1, personId: 1, name: "Ada" })]}
        otherEventSeats={{}}
        people={[
          withEvents(makePerson({ id: 1, name: "Ada" })),
          withEvents(makePerson({ id: 2, name: "Bea", phone: "48111222333" })),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /New guest/ }));
    await user.click(screen.getByRole("combobox", { name: "Existing person" }));
    await user.click(screen.getByRole("option", { name: /Bea/ }));
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/Wołacz/)).toHaveProperty("disabled", false);
    expect(screen.getByPlaceholderText("Phone")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("enables save only after every Polish case is filled", async () => {
    const user = userEvent.setup();
    render(
      <GuestsTab
        code="abcdef"
        guests={[]}
        otherEventSeats={{}}
        people={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /New guest/ }));
    await user.type(screen.getByLabelText("Name"), "Cyd");
    for (const label of [
      "Dopełniacz",
      "Celownik",
      "Biernik",
      "Narzędnik",
      "Miejscownik",
    ]) {
      await user.type(screen.getByLabelText(new RegExp(label)), "X");
    }
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByText("Enter the missing Polish cases: Wołacz."),
    ).toBeTruthy();
    await user.type(screen.getByLabelText(/Wołacz/), "X");
    expect(screen.getByText("Gender is required.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.queryByText(/Enter the missing Polish cases/)).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "Gender" }));
    await user.click(screen.getByRole("option", { name: "Female" }));
    expect(screen.queryByText("Gender is required.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("fills empty gender and cases from a namesake without locking contact", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    render(
      <GuestsTab
        code="abcdef"
        guests={[
          makeGuestView({
            id: 1,
            personId: 2,
            name: "Bea",
            gender: "female",
          }),
        ]}
        otherEventSeats={{}}
        people={[
          withEvents(
            makePerson({
              id: 2,
              name: "Bea",
              phone: "48111222333",
              email: "bea@example.com",
              language: "en",
              gender: "female",
              ...polishNameCases("Bei"),
            }),
            [{ id: 9, code: "xmas26", name: "Xmas", occursOn: "2026-12-24" }],
          ),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /New guest/ }));
    await user.type(screen.getByLabelText("Name"), "Bea");
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", false);
    await user.tab();
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", false);
    expect(screen.getByLabelText(/Dopełniacz/)).toHaveProperty("value", "Bei");
    expect(screen.getByLabelText(/Wołacz/)).toHaveProperty("value", "Bei");
    expect(screen.getByPlaceholderText("Phone")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Language" }).textContent).toContain(
      "Polish",
    );
    expect(screen.queryByText("Gender is required.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(requestJson).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "A person named Bea is already in these editions: Xmas (24 Dec 2026). Is this the same person, or a new one?",
      ),
    ).toBeTruthy();
  });

  it("posts createNew when the namesake is a new person", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: { id: 9 } });
    render(
      <GuestsTab
        code="abcdef"
        guests={[]}
        otherEventSeats={{}}
        people={[
          withEvents(
            makePerson({
              id: 2,
              name: "Bea",
              gender: "female",
              ...polishNameCases("Bei"),
            }),
          ),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /New guest/ }));
    await user.type(screen.getByLabelText("Name"), "Bea");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "New person" }));
    expect(postedBody()).toMatchObject({
      createNew: true,
      name: "Bea",
      phone: null,
      email: null,
      language: "pl",
      gender: "female",
      nameDopelniacz: "Bei",
    });
    expect(postedBody().personId).toBeUndefined();
  });

  it("posts personId when the namesake is the same person", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: { id: 9 } });
    render(
      <GuestsTab
        code="abcdef"
        guests={[]}
        otherEventSeats={{}}
        people={[
          withEvents(
            makePerson({
              id: 2,
              name: "Bea",
              phone: "48111222333",
              gender: "female",
              ...polishNameCases("Bei"),
            }),
          ),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /New guest/ }));
    await user.type(screen.getByLabelText("Name"), "Bea");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Same person" }));
    expect(postedBody()).toMatchObject({
      personId: 2,
      language: "pl",
      gender: "female",
      nameDopelniacz: "Bei",
    });
    expect(postedBody().createNew).toBeUndefined();
    expect(postedBody().phone).toBeUndefined();
  });
});
