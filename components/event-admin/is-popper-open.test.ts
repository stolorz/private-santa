/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { isPopperOpen } from "@/components/event-admin/is-popper-open";

describe("isPopperOpen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is false when no radix popper is mounted", () => {
    expect(isPopperOpen()).toBe(false);
  });

  it("is true when a radix popper wrapper is in the document", () => {
    const node = document.createElement("div");
    node.setAttribute("data-radix-popper-content-wrapper", "");
    document.body.append(node);
    expect(isPopperOpen()).toBe(true);
  });
});
