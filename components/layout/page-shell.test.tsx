/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredCard, PageShell } from "@/components/layout/page-shell";

describe("PageShell", () => {
  it("wraps children in a main landmark", () => {
    render(
      <PageShell>
        <p>Hello</p>
      </PageShell>,
    );
    expect(screen.getByRole("main").textContent).toContain("Hello");
  });
});

describe("CenteredCard", () => {
  it("shows the title and children", () => {
    render(
      <CenteredCard title="Organiser log in" description="Guests use a link.">
        <p>Form</p>
      </CenteredCard>,
    );
    expect(screen.getByText("Organiser log in")).toBeTruthy();
    expect(screen.getByText("Guests use a link.")).toBeTruthy();
    expect(screen.getByText("Form")).toBeTruthy();
  });
});
