/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makePerson } from "@/test/helpers/fixtures";
import type { PersonWithEvents } from "@/lib/people-types";

const refresh = vi.fn();
const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
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
  postPhoto: vi.fn(),
  requestJson: (...args: unknown[]) => requestJson(...args),
  displayFetchError: (error: string | null, fallback: string) =>
    error || fallback,
}));

import { PeopleSettings } from "@/components/settings/people-settings";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function person(
  overrides: Partial<PersonWithEvents> = {},
): PersonWithEvents {
  return { ...makePerson(overrides), events: overrides.events ?? [] };
}

describe("PeopleSettings", () => {
  it("shows an empty directory", () => {
    render(<PeopleSettings people={[]} />);
    expect(screen.getByText("No guests yet.")).toBeTruthy();
  });

  it("does not flag a person who already has a gender", () => {
    render(
      <PeopleSettings
        people={[person({ id: 1, name: "Ada", gender: "female" })]}
      />,
    );
    expect(screen.queryByText("Gender is required.")).toBeNull();
  });

  it("opens a person for editing", async () => {
    const user = userEvent.setup();
    render(<PeopleSettings people={[person({ id: 1, name: "Ada" })]} />);
    expect(screen.getByText("Gender is required.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Ada English/ }));
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Ada");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/Enter the missing Polish cases/)).toBeTruthy();
  });

  it("enables save only after every Polish case is filled", async () => {
    const user = userEvent.setup();
    render(<PeopleSettings people={[person({ id: 1, name: "Ada" })]} />);
    await user.click(screen.getByRole("button", { name: /Ada English/ }));
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
    await user.click(screen.getByRole("combobox", { name: "Gender" }));
    await user.click(screen.getByRole("option", { name: "Male" }));
    expect(screen.queryByText("Gender is required.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});
