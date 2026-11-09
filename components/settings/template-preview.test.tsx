/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyTemplatesView } from "@/lib/templates/fields";
import { PREVIEW_EVENTS } from "@/lib/templates/preview-fixtures";
import type { PreviewSample } from "@/lib/templates/preview";

const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { TemplatePreview } from "@/components/settings/template-preview";

function eventSample(
  eventId: string,
  giverId: string,
  receiverId: string,
): PreviewSample {
  const event = PREVIEW_EVENTS.find((item) => item.id === eventId)!;
  return {
    event,
    giver: event.guests.find((guest) => guest.id === giverId)!,
    receiver: event.guests.find((guest) => guest.id === receiverId)!,
  };
}

const FAMILY = eventSample("family", "anna", "piotr");
const CHILDREN = eventSample("children", "zosia", "yuki");

function renderPreview(
  itemId: Parameters<typeof TemplatePreview>[0]["itemId"],
  label: string,
  sample: PreviewSample,
  language: "en" | "pl" = "en",
) {
  cleanup();
  return render(
    <TemplatePreview
      key={`${itemId}-${sample.giver.id}-${language}`}
      itemId={itemId}
      label={label}
      view={emptyTemplatesView()}
      initialLanguage={language}
      initialSample={sample}
      onClose={vi.fn()}
    />,
  );
}

describe("TemplatePreview", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the unsaved invitation, then another sample", async () => {
    const user = userEvent.setup();
    const view = emptyTemplatesView();
    view.en["email.subject"] = "Hello preview";
    render(
      <TemplatePreview
        itemId="email.invitation"
        label="Invitation"
        view={view}
        initialLanguage="en"
        initialSample={FAMILY}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hello preview")).toBeTruthy();
    expect(within(dialog).getByText(/anna.kowalska@example.com/)).toBeTruthy();
    const frame = within(dialog).getByTitle("Invitation email preview");
    expect(frame.getAttribute("srcdoc")).toContain("Anna Kowalska");
    expect(frame.getAttribute("srcdoc")).toContain("/email/winter-banner.png");
    expect(frame.getAttribute("sandbox")).toBe("");

    const before = within(dialog).getByTestId("preview-sample").textContent;
    await user.click(within(dialog).getByRole("button", { name: "Refresh" }));
    expect(within(dialog).getByTestId("preview-sample").textContent).not.toBe(before);

    await user.click(within(dialog).getByRole("button", { name: "Polish" }));
    expect(
      within(dialog).getByText(/Zobacz, kogo wylosował/),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Hello preview")).toBeNull();
  });

  it("renders signal, push, and a guest with no contact", () => {
    renderPreview("signal.message", "Message", FAMILY);
    expect(screen.getByText(/\+48501234567/)).toBeTruthy();
    expect(screen.getByText(/prevw1/)).toBeTruthy();

    renderPreview("signal.message", "Message", CHILDREN);
    expect(screen.getByText(/no phone number/)).toBeTruthy();

    renderPreview("email.button", "Button", CHILDREN);
    expect(screen.getByText(/no email address/)).toBeTruthy();

    renderPreview("push.opened", "Opened", FAMILY);
    expect(
      screen.getByText("Anna Kowalska opened their private link."),
    ).toBeTruthy();

    renderPreview("email.wishlist_added", "Wishlist added", FAMILY);
    const added = within(screen.getByRole("dialog")).getByTitle(
      "Wishlist added email preview",
    );
    expect(added.getAttribute("srcdoc")).toContain("See the wishlist");
    expect(added.getAttribute("srcdoc")).toContain(
      "has added something to their wishlist",
    );
    expect(added.getAttribute("srcdoc")).not.toContain("Piotr");

    renderPreview("signal.wishlist_changed", "Wishlist changed", FAMILY);
    expect(
      screen.getByText(/has changed something on their wishlist/),
    ).toBeTruthy();
    expect(
      screen.getByText(/has changed something on their wishlist/).textContent,
    ).not.toContain("Piotr");
  });

  it("renders each reveal stage without calling the guest API", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
    const user = userEvent.setup();
    requestJson.mockReset();
    renderPreview("reveal.greeting", "Greeting", FAMILY);
    expect(screen.getByRole("heading", { name: "Hi, Anna Kowalska!" })).toBeTruthy();
    expect(
      screen.getByText(
        "Press the button below to see who you are preparing a present for. Only you can see this page.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Ciepły szalik")).toBeTruthy();
    expect(screen.queryByText("Previous years")).toBeNull();
    expect(screen.queryByText(/Photos from Family Christmas/)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /See who you're gifting/ }),
    );
    expect(
      (screen.getByRole("button", { name: /Opening/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    renderPreview("reveal.unwrap_button", "Unwrap button", FAMILY);
    const unwrap = screen.getByRole("button", {
      name: /See who you're gifting/,
    });
    expect((unwrap as HTMLButtonElement).disabled).toBe(false);
    await user.click(unwrap);
    expect(
      await screen.findByRole("img", { name: "Piotr Nowak" }, { timeout: 2000 }),
    ).toBeTruthy();
    expect(screen.getByText("This year you're gifting")).toBeTruthy();
    expect(screen.getByText("Piotr Nowak")).toBeTruthy();
    expect(screen.getByText("What Piotr Nowak would like to receive")).toBeTruthy();
    expect(screen.getByText("Słuchawki")).toBeTruthy();
    expect(screen.getByText("Ciepły szalik")).toBeTruthy();
    expect(screen.getByText("Previous years")).toBeTruthy();
    expect(screen.getByText("2025 — Zosia Kowalska")).toBeTruthy();
    expect(screen.getByText("2024 — Lucía Fernández")).toBeTruthy();
    expect(
      screen.queryByText(
        "Press the button below to see who you are preparing a present for. Only you can see this page.",
      ),
    ).toBeNull();
    expect(requestJson).not.toHaveBeenCalled();

    renderPreview("reveal.unwrap_error", "Unwrap error", FAMILY);
    expect(
      screen.getByText("Could not open your draw. Please try again."),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /See who you're gifting/ }),
    );
    expect(
      await screen.findByRole("img", { name: "Piotr Nowak" }, { timeout: 2000 }),
    ).toBeTruthy();
    expect(
      screen.queryByText("Could not open your draw. Please try again."),
    ).toBeNull();

    renderPreview("reveal.not_found", "Invalid link", FAMILY);
    expect(screen.getByRole("heading", { name: "Not found" })).toBeTruthy();
    expect(screen.getByText("This link is invalid.")).toBeTruthy();

    renderPreview("reveal.revealed_title", "Revealed title", FAMILY, "pl");
    expect(screen.getByText("W tym roku obdarujesz")).toBeTruthy();
    expect(screen.getByText("Piotra Nowaka")).toBeTruthy();
    expect(screen.getByText("Lista życzeń Piotra Nowaka")).toBeTruthy();
    expect(screen.getByText("Słuchawki")).toBeTruthy();
    expect(screen.getByText("Ciepły szalik")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Piotr Nowak" }).getAttribute("src")).toContain(
      "/preview/guests/piotr.jpg",
    );

    renderPreview("reveal.own_wishlist", "Own wishlist", CHILDREN);
    expect(screen.getByText("Your wishlist")).toBeTruthy();
    expect(screen.queryByText(/Nothing on your list yet/)).toBeNull();
    expect(screen.getByText("ハンドクリーム")).toBeTruthy();
    expect(screen.queryByText("Previous years")).toBeNull();
    expect(requestJson).not.toHaveBeenCalled();

    renderPreview("reveal.previous_years", "Previous years", FAMILY, "pl");
    expect(screen.getByText("Poprzednie lata")).toBeTruthy();
    expect(screen.getByText("Wcześniej przygotowywałaś prezenty dla")).toBeTruthy();
    expect(screen.getByText("2025 — Zosi Kowalskiej")).toBeTruthy();
    expect(screen.getByText("2024 — Lucii Fernández")).toBeTruthy();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("replaces the own wishlist with this year's photos after the party date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-25T12:00:00.000Z"));
    renderPreview("reveal.own_wishlist", "Own wishlist", FAMILY);
    expect(screen.queryByText("Your wishlist")).toBeNull();
    expect(screen.getByText("Photos from Family Christmas 2026")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "Photos" }).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(
      expect.arrayContaining([
        "/prevw1/photos/family",
        "/prevw1/photos/fam25a",
      ]),
    );
    expect(screen.getByText("2025 — Zosia Kowalska")).toBeTruthy();
  });

  it("hides the wishlist after the party even when that edition has no photos", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-07T12:00:00.000Z"));
    renderPreview("reveal.own_wishlist", "Own wishlist", CHILDREN);
    expect(screen.queryByText("Your wishlist")).toBeNull();
    expect(screen.queryByRole("link", { name: "Photos" })).toBeNull();
  });
});
