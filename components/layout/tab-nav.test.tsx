/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/settings/templates";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
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

import { TabNav } from "@/components/layout/tab-nav";

describe("TabNav", () => {
  it("marks the matching tab active, using exact when asked", () => {
    pathname = "/e/abcdef/admin";
    render(
      <TabNav
        tabs={[
          { href: "/e/abcdef/admin", label: "General", exact: true },
          { href: "/e/abcdef/admin/guests", label: "Guests" },
        ]}
      />,
    );
    const general = screen.getByRole("link", { name: "General" });
    expect(general.querySelector("span")?.className).toContain("bg-primary");
    expect(
      screen.getByRole("link", { name: "Guests" }).querySelector("span")
        ?.className,
    ).not.toContain("bg-primary");
  });

  it("treats nested paths as active unless exact", () => {
    pathname = "/settings/templates/extra";
    render(
      <TabNav
        tabs={[
          { href: "/settings/integrations", label: "Integrations" },
          { href: "/settings/templates", label: "Templates" },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Templates" }).querySelector("span")
        ?.className,
    ).toContain("bg-primary");
  });

  it("shows a red problem count and leaves a zero count off the label", () => {
    pathname = "/settings/templates";
    render(
      <TabNav
        tabs={[
          { href: "/settings/templates", label: "Templates", count: 3 },
          { href: "/settings/integrations", label: "Integrations", count: 0 },
        ]}
      />,
    );
    const templates = screen.getByRole("link", { name: "Templates (3)" });
    const count = templates.querySelector(".text-destructive");
    expect(count?.textContent).toBe(" (3)");
    expect(templates.querySelector("span")?.className).toContain("bg-primary");
    const integrations = screen.getByRole("link", { name: "Integrations" });
    expect(integrations.textContent).toBe("Integrations");
    expect(integrations.querySelector(".text-destructive")).toBeNull();
  });
});
