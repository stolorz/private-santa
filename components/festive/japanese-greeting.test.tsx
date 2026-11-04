/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JapaneseGreeting } from "@/components/festive/japanese-greeting";

const widths = new Map<string, number>();

afterEach(() => {
  widths.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockSupports(supported: boolean) {
  vi.stubGlobal("CSS", {
    supports: (property: string, value?: string) =>
      supported && property === "text-fit" && value === "shrink",
  });
}

function mockLayout(available: number) {
  mockSupports(true);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
    available,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const text = this.textContent ?? "";
      return {
        width: widths.get(text) ?? available,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      };
    },
  );
}

describe("JapaneseGreeting", () => {
  it("leaves the heading wrapping when the browser has no text-fit", () => {
    mockSupports(false);
    render(<JapaneseGreeting>Eva、こんにちは！</JapaneseGreeting>);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).not.toContain("jp-fit-line");
    expect(heading.className).not.toContain("text-balance");
  });

  it("shrinks onto one line when 60% of the size still fits", () => {
    widths.set("Eva、こんにちは！", 200);
    mockLayout(320);
    render(<JapaneseGreeting>Eva、こんにちは！</JapaneseGreeting>);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain(
      "jp-fit-line",
    );
  });

  it("wraps a name that is still too wide at the 60% floor", () => {
    widths.set("Johnatan Sebastien Arthur Stebbenhauer-Forst、こんにちは！", 500);
    mockLayout(320);
    render(
      <JapaneseGreeting>
        Johnatan Sebastien Arthur Stebbenhauer-Forst、こんにちは！
      </JapaneseGreeting>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).not.toContain("jp-fit-line");
    expect(heading.className).toContain("text-balance");
    expect(heading.querySelector("span")?.textContent).toBe("、こんにちは！");
    expect(heading.querySelector("span")?.className).toContain(
      "whitespace-nowrap",
    );
  });
});
