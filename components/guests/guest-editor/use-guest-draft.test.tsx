/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emptyGuestDraftSource, useGuestDraft } from "./use-guest-draft";

describe("useGuestDraft", () => {
  it("fills from a person and reports dirty fields", () => {
    const { result } = renderHook(() => useGuestDraft());
    const ada = { ...emptyGuestDraftSource(), name: "Ada", language: "en" };
    act(() => {
      result.current.fillFrom(ada);
    });
    expect(result.current.name).toBe("Ada");
    expect(result.current.isDirty(ada)).toBe(false);
    act(() => {
      result.current.setName("Bea");
    });
    expect(result.current.dirtyFields(ada).name).toBe(true);
    expect(result.current.toBody().name).toBe("Bea");
  });

  it("resets back to an empty draft", () => {
    const { result } = renderHook(() => useGuestDraft());
    act(() => {
      result.current.setName("Ada");
      result.current.setEmail("ada@example.com");
      result.current.reset();
    });
    expect(result.current.name).toBe("");
    expect(result.current.email).toBe("");
  });
});
