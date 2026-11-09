/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WinterPage } from "@/components/festive/winter-page";

describe("WinterPage", () => {
  it("keeps the phone column by default", () => {
    const { container } = render(
      <WinterPage title="Hi" brand={false} sprig={false}>
        body
      </WinterPage>,
    );
    const column = container.querySelector("main > div");
    expect(column?.className).toContain("max-w-md");
    expect(column?.className).not.toContain("lg:max-w-4xl");
  });

  it("widens from lg for guest galleries", () => {
    const { container } = render(
      <WinterPage title="Photos" brand={false} sprig={false} wide>
        body
      </WinterPage>,
    );
    const column = container.querySelector("main > div");
    expect(column?.className).toContain("max-w-md");
    expect(column?.className).toContain("lg:max-w-4xl");
  });
});
