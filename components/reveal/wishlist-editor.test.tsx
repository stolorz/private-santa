/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fetch-json")>();
  return {
    ...actual,
    requestJson: (...args: unknown[]) => requestJson(...args),
  };
});

import {
  WishlistEditor,
  wishlistUiCopy,
} from "@/components/reveal/wishlist-editor";

function ok(data: unknown) {
  return { ok: true, data, error: null, status: 200 };
}

describe("wishlistUiCopy", () => {
  it("returns English for an unknown language", () => {
    expect(wishlistUiCopy("fr").add).toBe("Add");
    expect(wishlistUiCopy(undefined).placeholder).toContain("warm scarf");
  });

  it("returns Polish, German, Spanish, and Japanese labels", () => {
    expect(wishlistUiCopy("pl")).toMatchObject({
      add: "Dodaj",
      remove: "Usuń",
      edit: "Edytuj",
      save: "Zapisz",
      cancel: "Anuluj",
    });
    expect(wishlistUiCopy("de")).toMatchObject({
      placeholder: "Geschenkwunsch eingeben (z. B. ein warmer Schal)",
      add: "Hinzufügen",
    });
    expect(wishlistUiCopy("es").add).toBe("Añadir");
    expect(wishlistUiCopy("ja").add).toBe("追加する");
  });
});

describe("WishlistEditor", () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it("adds and removes wishlist items", async () => {
    const user = userEvent.setup();
    requestJson.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        return ok({ id: 2, guestId: 1, text: "A book", createdAt: new Date() });
      }
      return ok({});
    });
    render(
      <WishlistEditor
        token="abcdefghijkl"
        initial={[
          {
            id: 1,
            guestId: 1,
            text: "A scarf",
            createdAt: new Date("2026-01-01"),
          },
        ]}
      />,
    );
    expect(screen.getByText("A scarf")).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/warm scarf/), "A book");
    await user.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() => expect(screen.getByText("A book")).toBeTruthy());
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    await waitFor(() => expect(screen.queryByText("A scarf")).toBeNull());
  });

  it("skips an empty-list hint and still shows the add field", () => {
    render(<WishlistEditor token="abcdefghijkl" initial={[]} />);
    expect(screen.queryByText(/Nothing on your list yet/)).toBeNull();
    expect(screen.getByPlaceholderText(/warm scarf/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();
  });

  it("localizes Polish placeholder and buttons", () => {
    render(
      <WishlistEditor
        token="abcdefghijkl"
        initial={[
          {
            id: 1,
            guestId: 1,
            text: "Ciepły szalik",
            createdAt: new Date("2026-01-01"),
          },
        ]}
        language="pl"
      />,
    );
    expect(screen.getByPlaceholderText(/ciepły szalik/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dodaj" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Usuń" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edytuj" })).toBeTruthy();
  });

  it("edits a row, can cancel, and skips an empty save", async () => {
    const user = userEvent.setup();
    requestJson.mockImplementation(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { text: string };
        return ok({
          id: 1,
          guestId: 1,
          text: body.text,
          createdAt: new Date("2026-01-01"),
        });
      }
      return ok({});
    });
    render(
      <WishlistEditor
        token="abcdefghijkl"
        initial={[
          {
            id: 1,
            guestId: 1,
            text: "A scarf",
            createdAt: new Date("2026-01-01"),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByDisplayValue("A scarf");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(requestJson).not.toHaveBeenCalled();

    await user.type(field, "A hat");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("A scarf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(requestJson).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const again = screen.getByDisplayValue("A scarf");
    await user.clear(again);
    await user.type(again, "Warm gloves");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Warm gloves")).toBeTruthy());
    expect(requestJson).toHaveBeenCalledWith(
      expect.stringContaining("/wishlist/1"),
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(screen.queryByText("A scarf")).toBeNull();
  });

  it("localizes German and uses Wunsch terminology in the placeholder", () => {
    render(<WishlistEditor token="abcdefghijkl" initial={[]} language="de" />);
    expect(
      screen.getByPlaceholderText(/Geschenkwunsch eingeben/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hinzufügen" })).toBeTruthy();
  });

  it("localizes the Japanese add field", () => {
    render(<WishlistEditor token="abcdefghijkl" initial={[]} language="ja" />);
    expect(screen.getByPlaceholderText(/あたたかいマフラー/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "追加する" })).toBeTruthy();
  });

  it("shows the closed message when add, edit, or delete is refused after the party", async () => {
    const user = userEvent.setup();
    const closed = "The wishlist cannot be changed after the event date.";
    requestJson.mockResolvedValue({
      ok: false,
      data: null,
      error: closed,
      status: 400,
    });
    render(
      <WishlistEditor
        token="abcdefghijkl"
        initial={[
          {
            id: 1,
            guestId: 1,
            text: "A scarf",
            createdAt: new Date("2026-01-01"),
          },
        ]}
      />,
    );

    await user.type(screen.getByPlaceholderText(/warm scarf/), "A book");
    await user.click(screen.getByRole("button", { name: /Add/ }));
    expect(await screen.findAllByText(closed)).toHaveLength(1);
    expect(screen.queryByText("A book")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findAllByText(closed)).toHaveLength(2);
    expect(screen.getByText("A scarf")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByDisplayValue("A scarf");
    await user.clear(field);
    await user.type(field, "Warm gloves");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findAllByText(closed)).toHaveLength(3);
    expect(screen.getByDisplayValue("Warm gloves")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("A scarf")).toBeTruthy();
  });

  it("localizes Spanish and truncates a long placeholder with an ellipsis", () => {
    render(<WishlistEditor token="abcdefghijkl" initial={[]} language="es" />);
    const input = screen.getByPlaceholderText(/una bufanda/);
    expect(screen.getByRole("button", { name: "Añadir" })).toBeTruthy();
    expect(input.className).toMatch(/min-w-0/);
    expect(input.className).toMatch(/truncate/);
    expect(input.className).toMatch(/placeholder:truncate/);
  });
});
