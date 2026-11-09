/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PastGift } from "@/lib/reveal";
import { PreviousYears } from "@/components/reveal/previous-years";
import { galleryPath } from "@/lib/public-path";

const COPY = {
  previousTitle: "Previous years",
  previousDescription: "Previously you have prepared presents for",
  previousRow: "{year} — {receiver}",
  photosButton: "Photos",
};

function gift(overrides: Partial<PastGift> = {}): PastGift {
  return {
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
    ...overrides,
  };
}

describe("PreviousYears", () => {
  it("renders nothing without gifts", () => {
    const { container } = render(
      <PreviousYears gifts={[]} copy={COPY} token="tok123" />,
    );
    expect(container.textContent).toBe("");
  });

  it("keeps a plain row when that year has no ready photos, even with an edition code", () => {
    render(
      <PreviousYears gifts={[gift()]} copy={COPY} token="tok123" />,
    );
    expect(screen.getByText("2025 — Cara Diaz")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Photos" })).toBeNull();
  });

  it("mixes a photos button with a plain row in the same list", () => {
    render(
      <PreviousYears
        gifts={[
          gift({ photoCount: 3, year: "2025" }),
          gift({
            name: "Drew Cole",
            personId: 4,
            year: "2024",
            eventCode: "past24",
            photoCount: 0,
          }),
        ]}
        copy={COPY}
        token="tok123"
      />,
    );
    expect(screen.getAllByRole("link", { name: "Photos" })).toHaveLength(1);
    expect(screen.getByText("2024 — Drew Cole")).toBeTruthy();
  });

  it("adds a truncated photos button when that year has pictures", () => {
    render(
      <PreviousYears
        gifts={[gift({ photoCount: 4, name: "Cara Diaz with a very long name" })]}
        copy={COPY}
        token="tok123"
      />,
    );
    const row = screen.getByTitle("2025 — Cara Diaz with a very long name");
    expect(row.className).toContain("truncate");
    expect(screen.getByRole("link", { name: "Photos" })).toHaveProperty(
      "href",
      expect.stringContaining(galleryPath("tok123", "past25")),
    );
  });
});
