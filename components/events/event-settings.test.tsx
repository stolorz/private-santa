/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  eventLocation,
  eventNameTranslations,
  makeEvent,
  polishNameCases,
} from "@/test/helpers/fixtures";

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

import { EventSettingsForm } from "@/components/events/event-settings";

const EVENT_CASES = [
  ["Dopełniacz", "Świąt"],
  ["Celownik", "Świętom"],
  ["Biernik", "Święta"],
  ["Narzędnik", "Świętami"],
  ["Miejscownik", "Świętach"],
  ["Wołacz", "Święta"],
] as const;

async function fillEventCases(user: UserEvent) {
  for (const [label, value] of EVENT_CASES) {
    await user.type(screen.getByLabelText(new RegExp(`^${label},`)), value);
  }
}

describe("EventSettingsForm", () => {
  beforeEach(() => {
    refresh.mockReset();
    requestJson.mockReset();
    requestJson.mockResolvedValue({
      ok: true,
      data: makeEvent({ name: "Family Xmas" }),
      error: null,
      status: 200,
    });
  });

  it("refuses to save until every translation is filled", async () => {
    const user = userEvent.setup();
    render(<EventSettingsForm event={makeEvent({ ...eventLocation() })} />);
    expect(
      screen.getByText(
        "Enter the missing event name translations: Polish, German, Spanish, Japanese.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByLabelText("Polish").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(requestJson).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Polish"), "Święta");
    await user.type(screen.getByLabelText("German"), "Weihnachten");
    await user.type(screen.getByLabelText("Spanish"), "Navidad");
    await user.type(screen.getByLabelText("Japanese"), "クリスマス");
    expect(
      screen.queryByText(/Enter the missing event name translations/),
    ).toBeNull();
    await fillEventCases(user);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(screen.getByRole("radio", { name: "No spending limit" }));

    const name = screen.getByLabelText("Name (en)");
    await user.clear(name);
    await user.type(name, "Family Xmas");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const body = JSON.parse(
      (requestJson.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body).toMatchObject({
      name: "Family Xmas",
      namePl: "Święta",
      nameDe: "Weihnachten",
      nameEs: "Navidad",
      nameJa: "クリスマス",
      nameDopelniacz: "Świąt",
      nameCelownik: "Świętom",
      nameBiernik: "Święta",
      nameNarzednik: "Świętami",
      nameMiejscownik: "Świętach",
      nameWolacz: "Święta",
      budgetKind: "unlimited",
      budget: null,
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText("Saved.")).toBeTruthy();
  });

  it("opens a positive amount with no stored kind as a budget", () => {
    render(
      <EventSettingsForm
        event={makeEvent({
          ...eventNameTranslations(),
          ...polishNameCases("Święta"),
          ...eventLocation(),
          budgetKind: null,
          budget: 40,
          currency: "PLN",
        })}
      />,
    );
    expect(screen.getByRole("radio", { name: "Set a budget" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByLabelText("Amount")).toHaveProperty("value", "40");
    expect(
      screen.queryByText(
        "Choose a budget, make-the-gift, or no spending limit.",
      ),
    ).toBeNull();
  });

  it("opens a stored make-the-gift choice without an amount field", () => {
    render(
      <EventSettingsForm
        event={makeEvent({
          ...eventNameTranslations(),
          ...polishNameCases("Święta"),
          ...eventLocation(),
          budgetKind: "zero",
          budget: 40,
        })}
      />,
    );
    expect(screen.getByRole("radio", { name: "Make the gift" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.queryByLabelText("Amount")).toBeNull();
  });

  it("refuses to save when the date is cleared", () => {
    render(
      <EventSettingsForm
        event={makeEvent({ ...eventNameTranslations() })}
      />,
    );
    const message =
      "Enter the event date. Guest messages will include it, so these details cannot be saved without one.";
    expect(screen.queryByText(message)).toBeNull();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByLabelText("Date").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("refuses to save until every Polish case is filled", async () => {
    const user = userEvent.setup();
    render(
      <EventSettingsForm
        event={makeEvent({ ...eventNameTranslations(), ...eventLocation() })}
      />,
    );
    const message =
      "Enter the missing Polish cases for the event name: Dopełniacz, Celownik, Biernik, Narzędnik, Miejscownik, Wołacz.";
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByLabelText(/Dopełniacz/).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(requestJson).not.toHaveBeenCalled();

    await fillEventCases(user);

    expect(
      screen.queryByText(/Enter the missing Polish cases for the event name/),
    ).toBeNull();
    expect(
      screen.getByLabelText(/Dopełniacz/).getAttribute("aria-invalid"),
    ).toBeNull();
    expect(
      screen.getByText(
        "Choose a budget, make-the-gift, or no spending limit.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );

    await user.click(screen.getByRole("radio", { name: "Make the gift" }));
    expect(
      screen.queryByText(
        "Choose a budget, make-the-gift, or no spending limit.",
      ),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("refuses to save until the place and Polish phrase are filled", async () => {
    const user = userEvent.setup();
    render(
      <EventSettingsForm
        event={makeEvent({
          ...eventNameTranslations(),
          ...polishNameCases("Święta"),
          budgetKind: "unlimited",
        })}
      />,
    );
    expect(
      screen.getByText(
        "Enter the missing location: place name, Polish phrase (gdzie?).",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByLabelText("Place").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(
      screen.getByLabelText("Polish (gdzie?)").getAttribute("aria-invalid"),
    ).toBe("true");

    await user.type(screen.getByLabelText("Place"), "Katowice");
    expect(
      screen.getByText("Enter the missing location: Polish phrase (gdzie?)."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Place").getAttribute("aria-invalid")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(requestJson).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Polish (gdzie?)"), "w Katowicach");
    expect(screen.queryByText(/Enter the missing location/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const body = JSON.parse(
      (requestJson.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(body).toMatchObject({
      location: "Katowice",
      locationGdzie: "w Katowicach",
    });
    expect(screen.getByText("Saved.")).toBeTruthy();
  });

  it("refuses to save a whitespace-only place over a stored one", () => {
    render(
      <EventSettingsForm
        event={makeEvent({
          ...eventNameTranslations(),
          ...polishNameCases("Święta"),
          ...eventLocation(),
          budgetKind: "unlimited",
        })}
      />,
    );
    expect(screen.queryByText(/Enter the missing location/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.change(screen.getByLabelText("Place"), {
      target: { value: "   " },
    });

    expect(
      screen.getByText("Enter the missing location: place name."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("shows only the missing Polish phrase when the place is set", () => {
    render(
      <EventSettingsForm
        event={makeEvent({ location: "Wrocław", locationGdzie: null })}
      />,
    );
    expect(screen.getByLabelText("Place")).toHaveProperty("value", "Wrocław");
    expect(
      screen.getByText("Enter the missing location: Polish phrase (gdzie?)."),
    ).toBeTruthy();
  });

  it("refuses to save zero as a budget amount", async () => {
    const user = userEvent.setup();
    render(
      <EventSettingsForm
        event={makeEvent({
          ...eventNameTranslations(),
          ...polishNameCases("Święta"),
          ...eventLocation(),
        })}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Set a budget" }));
    await user.type(screen.getByLabelText("Amount"), "0");
    expect(
      screen.getByText(
        "Zero is not a budget amount. Choose make-the-gift if guests should not spend money.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(requestJson).not.toHaveBeenCalled();
  });
});
