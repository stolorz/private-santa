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
    const templates = screen.getByRole("link", { name: "Templates 3" });
    const count = templates.querySelector("[data-tab-count]");
    expect(count?.textContent).toBe("3");
    expect(count?.className).toContain("text-destructive");
    expect(templates.querySelector("span")?.className).toContain(
      "whitespace-nowrap",
    );
    expect(templates.querySelector("span")?.className).toContain("bg-primary");
    const integrations = screen.getByRole("link", { name: "Integrations" });
    expect(integrations.textContent).toBe("Integrations");
    expect(integrations.querySelector("[data-tab-count]")).toBeNull();
  });

  it("shows a muted tally chip on inventory counts", () => {
    pathname = "/e/abcdef/admin/guests";
    render(
      <TabNav
        tabs={[
          {
            href: "/e/abcdef/admin/guests",
            label: "Guests",
            count: 12,
            countTone: "muted",
          },
          {
            href: "/e/abcdef/admin/photos",
            label: "Photos",
            count: 4,
            countTone: "muted",
          },
          {
            href: "/e/abcdef/admin/templates",
            label: "Templates",
            count: 2,
          },
        ]}
      />,
    );
    const guests = screen.getByRole("link", { name: "Guests 12" });
    const guestsCount = guests.querySelector("[data-tab-count]");
    expect(guestsCount?.getAttribute("data-tab-count")).toBe("12");
    expect(guestsCount?.className).toContain("text-primary-foreground");
    expect(guestsCount?.className).not.toContain("text-destructive");
    const photos = screen.getByRole("link", { name: "Photos 4" });
    const photosCount = photos.querySelector("[data-tab-count]");
    expect(photosCount?.className).toContain("text-muted-foreground");
    expect(photosCount?.className).not.toContain("text-destructive");
    const templates = screen.getByRole("link", { name: "Templates 2" });
    expect(templates.querySelector("[data-tab-count]")?.className).toContain(
      "text-destructive",
    );
  });
});
