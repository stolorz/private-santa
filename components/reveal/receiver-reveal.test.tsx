/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PastGift, RevealedMatch } from "@/lib/reveal";
import type { RevealCopy } from "@/lib/templates/render";

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

import { ReceiverReveal } from "@/components/reveal/receiver-reveal";
import { previewPhotoUrl } from "@/lib/templates/preview";
import { WishlistEditor } from "@/components/reveal/wishlist-editor";

const COPY: RevealCopy = {
  greeting: "Hi",
  readyDescription: "Tap the gift",
  unwrapButton: "Unwrap",
  unwrapping: "Unwrapping…",
  revealedTitle: "You drew {receiver}",
  revealedName: "{receiver}",
  budgetLabel: "About €20",
  wishlistHeading: "Wishlist",
  wishlistEmpty: "Nothing yet",
  ownWishlistTitle: "Your wishlist",
  ownWishlistDescription: "Add ideas",
  previousTitle: "Previous years",
  previousDescription: "Previously you have prepared presents for",
  previousRow: "{year} — {receiver}",
  photosButton: "Photos",
  photosCurrent: "Photos from this year",
  galleryTitle: "Photos",
  galleryBack: "Back",
  galleryDownload: "Download original",
  galleryClose: "Close",
  galleryPrevious: "Previous photo",
  galleryNext: "Next photo",
  notFoundTitle: "Missing",
  notFoundDescription: "Gone",
  unwrapError: "Could not unwrap.",
};

const MATCH: RevealedMatch = {
  name: "Bea Costa",
  nameDopelniacz: null,
  nameCelownik: null,
  nameBiernik: null,
  nameNarzednik: null,
  nameMiejscownik: null,
  nameWolacz: null,
  gender: null,
  photo: null,
  wishlist: [{ id: 1, text: "A scarf" }],
};

const PAST_GIFTS: PastGift[] = [
  {
    name: "Cara Diaz",
    nameDopelniacz: "Cary Diaz",
    nameCelownik: null,
    nameBiernik: null,
    nameNarzednik: null,
    nameMiejscownik: null,
    nameWolacz: null,
    gender: "female",
    year: "2025",
    personId: 3,
    eventCode: "past25",
    photoCount: 0,
  },
  {
    name: "Drew Cole",
    nameDopelniacz: null,
    nameCelownik: null,
    nameBiernik: null,
    nameNarzednik: null,
    nameMiejscownik: null,
    nameWolacz: null,
    gender: "male",
    year: "2024",
    personId: 4,
    eventCode: "past24",
    photoCount: 2,
  },
];

describe("ReceiverReveal", () => {
  it("unwraps a match and records open + wishlist-seen", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    refresh.mockReset();
    requestJson.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith("/open") || String(url).endsWith("/wishlist-seen")) {
        return { ok: true, data: {}, error: null, status: 200 };
      }
      if (init?.method === "POST") {
        return { ok: true, data: { match: MATCH }, error: null, status: 200 };
      }
      return { ok: false, data: null, error: "nope", status: 500 };
    });

    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget="€20"
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
      />,
    );

    expect(screen.getByText("Tap the gift")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Unwrap/ }));
    await waitFor(() => expect(screen.getByText("Bea Costa")).toBeTruthy());
    expect(screen.getByText("A scarf")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect(requestJson).toHaveBeenCalledWith(
      expect.stringContaining("/open"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows the unwrap error from the API", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    requestJson.mockResolvedValue({
      ok: false,
      data: null,
      error: "Draw not ready.",
      status: 409,
    });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Unwrap/ }));
    await waitFor(() => expect(screen.getByText("Draw not ready.")).toBeTruthy());
  });

  it("renders initials and an empty wishlist when already revealed", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={COPY}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
      />,
    );
    expect(screen.getByText("BC")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Wishlist" })).toBeTruthy();
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });

  it("shows the portrait above the label and name, and interpolates the heading", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={{ ...COPY, wishlistHeading: "{receiver}'s list" }}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
      />,
    );
    const portrait = screen.getByText("BC");
    const label = screen.getByText("You drew Bea Costa");
    const name = screen.getByText("Bea Costa");
    expect(
      portrait.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      label.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bea Costa's list" })).toBeTruthy();
  });

  it("shows a declined Polish name from the revealed-name template", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={{
          ...COPY,
          revealedTitle: "W tym roku obdarujesz",
          revealedName: "{receiver_biernik}",
        }}
        initiallyRevealed
        initialMatch={{
          ...MATCH,
          name: "Barbara",
          nameBiernik: "Barbarę",
          wishlist: [],
        }}
      />,
    );
    expect(screen.getByText("W tym roku obdarujesz")).toBeTruthy();
    expect(screen.getByText("Barbarę")).toBeTruthy();
    expect(screen.queryByText("Barbara")).toBeNull();
  });

  it("previews a portrait without opening or unwrapping", () => {
    requestJson.mockReset();
    render(
      <ReceiverReveal
        preview
        photoSrc={previewPhotoUrl}
        token="previewguest"
        budget="Budget: 50 €"
        copy={COPY}
        initiallyRevealed
        initialMatch={{ ...MATCH, name: "Anna Kowalska", photo: "anna.jpg" }}
      />,
    );
    expect(screen.getByRole("img", { name: "Anna Kowalska" }).getAttribute("src")).toContain(
      "/preview/guests/anna.jpg",
    );
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("reveals a fixture locally when the preview asks it to", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    const onPreviewUnwrap = vi.fn();
    render(
      <ReceiverReveal
        preview
        onPreviewUnwrap={onPreviewUnwrap}
        token="previewguest"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Unwrap/ }));
    expect(onPreviewUnwrap).toHaveBeenCalledOnce();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("ignores unwrap and shows a staged error or busy label", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    const { rerender } = render(
      <ReceiverReveal
        preview
        token="previewguest"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Unwrap/ }));
    expect(screen.getByText("Tap the gift")).toBeTruthy();
    expect(requestJson).not.toHaveBeenCalled();

    rerender(
      <ReceiverReveal
        preview
        previewBusy
        token="previewguest"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
      />,
    );
    expect(
      (screen.getByRole("button", { name: /Unwrapping/ }) as HTMLButtonElement).disabled,
    ).toBe(true);

    rerender(
      <ReceiverReveal
        preview
        previewError="Could not unwrap your match."
        token="previewguest"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
      />,
    );
    expect(screen.getByText("Could not unwrap your match.")).toBeTruthy();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("hides previous years until unwrap", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    refresh.mockReset();
    requestJson.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith("/open") || String(url).endsWith("/wishlist-seen")) {
        return { ok: true, data: {}, error: null, status: 200 };
      }
      if (init?.method === "POST") {
        return { ok: true, data: { match: MATCH }, error: null, status: 200 };
      }
      return { ok: false, data: null, error: "nope", status: 500 };
    });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
        previousGifts={PAST_GIFTS}
      >
        <p>Your wishlist</p>
      </ReceiverReveal>,
    );
    expect(screen.getByText("Tap the gift")).toBeTruthy();
    expect(screen.getByText("Your wishlist")).toBeTruthy();
    expect(screen.queryByText("Previous years")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Unwrap/ }));
    await waitFor(() => expect(screen.getByText("Previous years")).toBeTruthy());
    expect(screen.getByText("Previously you have prepared presents for")).toBeTruthy();
    expect(screen.getByText("2025 — Cara Diaz")).toBeTruthy();
    expect(screen.getByText("2024 — Drew Cole")).toBeTruthy();
    expect(screen.getByText("Bea Costa")).toBeTruthy();
    expect(screen.getByText("Your wishlist")).toBeTruthy();
  });

  it("keeps previous years hidden when the giver has no history", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={COPY}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
        previousGifts={[]}
      />,
    );
    expect(screen.getByText("Bea Costa")).toBeTruthy();
    expect(screen.queryByText("Previous years")).toBeNull();
  });

  it("interpolates a Polish genitive previous-years row", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={{
          ...COPY,
          previousTitle: "Poprzednie lata",
          previousDescription: "Wcześniej przygotowywałaś prezenty dla",
          previousRow: "{year} — {receiver_dopelniacz}",
        }}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
        previousGifts={[PAST_GIFTS[0]!]}
      />,
    );
    expect(screen.getByText("Poprzednie lata")).toBeTruthy();
    expect(screen.getByText("Wcześniej przygotowywałaś prezenty dla")).toBeTruthy();
    expect(screen.getByText("2025 — Cary Diaz")).toBeTruthy();
    expect(screen.queryByText("2025 — Cara Diaz")).toBeNull();
  });

  it("falls back to year and nominative name when the row template is blank", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="abcdefghijkl"
        budget={null}
        copy={{ ...COPY, previousRow: "   " }}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
        previousGifts={[PAST_GIFTS[0]!]}
      />,
    );
    expect(screen.getByText("2025 — Cara Diaz")).toBeTruthy();
  });

  it("omits this year's photos card when the page did not pass an edition code", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="tok123"
        budget={null}
        copy={COPY}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
        previousGifts={PAST_GIFTS}
      />,
    );
    expect(screen.queryByText("Photos from this year")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Photos" })).toHaveLength(1);
  });

  it("shows a photos button for years that have pictures and a card for this edition", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="tok123"
        budget={null}
        copy={COPY}
        initiallyRevealed
        initialMatch={{ ...MATCH, wishlist: [] }}
        previousGifts={PAST_GIFTS}
        currentEventCode="now001"
      />,
    );
    expect(screen.getAllByRole("link", { name: "Photos" })).toHaveLength(2);
    expect(screen.getByText("Photos from this year")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Photos" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/tok123/photos/now001"),
        expect.stringContaining("/tok123/photos/past24"),
      ]),
    );
    expect(screen.queryByRole("link", { name: "2025 — Cara Diaz" })).toBeNull();
  });

  it("shows this edition's photos card before unwrap", () => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({ ok: true, data: {}, error: null, status: 200 });
    render(
      <ReceiverReveal
        token="tok123"
        budget={null}
        copy={COPY}
        initiallyRevealed={false}
        initialMatch={null}
        currentEventCode="now001"
      />,
    );
    expect(screen.getByText("Photos from this year")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Photos" })).toBeTruthy();
  });
});

describe("WishlistEditor", () => {
  it("adds and removes items through the reveal API", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    requestJson
      .mockResolvedValueOnce({
        ok: true,
        data: { id: 2, text: "Warm socks", guestId: 1, createdAt: "2026-01-01" },
        error: null,
        status: 201,
      })
      .mockResolvedValueOnce({ ok: true, data: {}, error: null, status: 200 });

    render(
      <WishlistEditor
        token="abcdefghijkl"
        initial={[{ id: 1, guestId: 1, text: "A scarf", createdAt: new Date() }]}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Write a gift idea (e.g. a warm scarf)"),
      "Warm socks",
    );
    await user.click(screen.getByRole("button", { name: /Add/ }));
    await waitFor(() => expect(screen.getByText("Warm socks")).toBeTruthy());

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    await waitFor(() => expect(screen.queryByText("A scarf")).toBeNull());
  });

  it("ignores a blank add", async () => {
    const user = userEvent.setup();
    requestJson.mockReset();
    render(<WishlistEditor token="abcdefghijkl" initial={[]} />);
    await user.click(screen.getByRole("button", { name: /Add/ }));
    expect(requestJson).not.toHaveBeenCalled();
    expect(screen.queryByText(/Nothing on your list yet/)).toBeNull();
  });
});
