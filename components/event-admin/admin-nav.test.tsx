/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/e/abcdef/admin/guests",
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
  useLinkStatus: () => ({ pending: false }),
}));

import { AdminNav } from "@/components/event-admin/admin-nav";

describe("AdminNav", () => {
  it("links edition tabs including the guest count", () => {
    render(<AdminNav code="abcdef" guestCount={3} photoCount={4} />);
    expect(screen.getByRole("link", { name: "General" })).toHaveProperty(
      "href",
      expect.stringContaining("/e/abcdef/admin"),
    );
    expect(screen.getByRole("link", { name: "Templates" })).toHaveProperty(
      "href",
      expect.stringContaining("/e/abcdef/admin/templates"),
    );
    expect(screen.getByRole("link", { name: "Guests 3" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Exclusions" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Draw" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Delivery" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Photos 4" })).toHaveProperty(
      "href",
      expect.stringContaining("/e/abcdef/admin/photos"),
    );
  });

  it("hides guest and photo chips when the count is zero", () => {
    render(<AdminNav code="abcdef" guestCount={0} photoCount={0} />);
    expect(screen.getByRole("link", { name: "Guests" }).textContent).toBe(
      "Guests",
    );
    expect(screen.getByRole("link", { name: "Photos" }).textContent).toBe(
      "Photos",
    );
  });
});
