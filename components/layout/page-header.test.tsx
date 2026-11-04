/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/layout/page-header";

describe("PageHeader", () => {
  it("renders the title", () => {
    render(<PageHeader title="Events" />);
    expect(screen.getByRole("heading", { name: "Events" })).toBeTruthy();
  });

  it("renders optional actions", () => {
    render(<PageHeader title="Events" actions={<button type="button">New</button>} />);
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
  });

  it("renders a leading control before the title", () => {
    render(
      <PageHeader
        title="Settings"
        leading={<button type="button">Sign out</button>}
      />,
    );
    const signOut = screen.getByRole("button", { name: "Sign out" });
    const title = screen.getByRole("heading", { name: "Settings" });
    expect(signOut.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
