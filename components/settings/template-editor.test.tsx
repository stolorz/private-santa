/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateEditor } from "@/components/settings/template-editor";

type Observed = {
  callback: ResizeObserverCallback;
  el: Element;
};

let offsetWidth = 240;
let scrollHeight = 180;
let observed: Observed[] = [];

const OriginalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock implements ResizeObserver {
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(el: Element) {
    observed.push({ callback: this.callback, el });
  }

  unobserve() {}

  disconnect() {
    observed = observed.filter((entry) => entry.callback !== this.callback);
  }
}

function mockBox(proto: typeof HTMLTextAreaElement.prototype) {
  Object.defineProperty(proto, "offsetWidth", {
    configurable: true,
    get() {
      return offsetWidth;
    },
  });
  Object.defineProperty(proto, "scrollHeight", {
    configurable: true,
    get() {
      return scrollHeight;
    },
  });
}

function restoreBox(proto: typeof HTMLTextAreaElement.prototype) {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  if (width) Object.defineProperty(proto, "offsetWidth", width);
  else delete (proto as { offsetWidth?: number }).offsetWidth;
  if (height) Object.defineProperty(proto, "scrollHeight", height);
  else delete (proto as { scrollHeight?: number }).scrollHeight;
}

beforeEach(() => {
  offsetWidth = 240;
  scrollHeight = 180;
  observed = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  mockBox(HTMLTextAreaElement.prototype);
});

afterEach(() => {
  restoreBox(HTMLTextAreaElement.prototype);
  if (OriginalResizeObserver) {
    vi.stubGlobal("ResizeObserver", OriginalResizeObserver);
  } else {
    vi.unstubAllGlobals();
  }
});

describe("TemplateEditor autosize", () => {
  it("sizes a multiline field to its content height", () => {
    render(
      <TemplateEditor multiline value={"a\nb\nc"} onChange={() => {}} />,
    );
    const field = screen.getByRole("combobox");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field.className).toContain("resize-none");
    expect(field.style.height).toBe("180px");
  });

  it("grows when the value gets taller", () => {
    const { rerender } = render(
      <TemplateEditor multiline value="short" onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox").style.height).toBe("180px");

    scrollHeight = 260;
    rerender(
      <TemplateEditor multiline value={"short\n\nlonger"} onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox").style.height).toBe("260px");
  });

  it("does not collapse a hidden field, then fits after it is laid out", () => {
    offsetWidth = 0;
    render(
      <TemplateEditor multiline value={"a\nb\nc"} onChange={() => {}} />,
    );
    const field = screen.getByRole("combobox");
    expect(field.style.height).toBe("");

    offsetWidth = 240;
    scrollHeight = 220;
    for (const entry of observed) {
      entry.callback([], entry as unknown as ResizeObserver);
    }
    expect(field.style.height).toBe("220px");
  });

  it("leaves a single-line field as an input without a content height", () => {
    render(<TemplateEditor value="Hi {giver}" onChange={() => {}} />);
    const field = screen.getByRole("combobox");
    expect(field.tagName).toBe("INPUT");
    expect(field.style.height).toBe("");
    expect(observed).toEqual([]);
  });

  it("marks an invalid field for assistive tech and paints a red border", () => {
    render(
      <TemplateEditor
        value="{receiver_gender|female:a|male:b|x}"
        invalid
        dirty
        onChange={() => {}}
      />,
    );
    const field = screen.getByRole("combobox");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.parentElement?.className).toContain("border-destructive");
  });
});
