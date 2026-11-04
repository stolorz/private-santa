/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/safety",
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

import { SettingsNav } from "@/components/settings/settings-nav";

describe("SettingsNav", () => {
  it("lists the four settings tabs", () => {
    render(<SettingsNav />);
    expect(screen.getByRole("link", { name: "Integrations" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Templates" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Guests" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Safety" })).toBeTruthy();
  });
});
