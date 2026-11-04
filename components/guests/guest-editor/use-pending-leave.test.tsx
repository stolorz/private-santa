/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePendingLeave } from "./use-pending-leave";

describe("usePendingLeave", () => {
  it("runs immediately when the draft is clean", () => {
    const { result } = renderHook(() => usePendingLeave());
    const next = vi.fn();
    act(() => {
      result.current.tryLeave(false, next);
    });
    expect(next).toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  it("holds a dirty leave until take() or stay()", () => {
    const { result } = renderHook(() => usePendingLeave());
    const next = vi.fn();
    act(() => {
      result.current.tryLeave(true, next);
    });
    expect(result.current.open).toBe(true);
    expect(next).not.toHaveBeenCalled();

    act(() => {
      result.current.stay();
    });
    expect(result.current.open).toBe(false);
    expect(next).not.toHaveBeenCalled();

    act(() => {
      result.current.tryLeave(true, next);
      result.current.take()?.();
    });
    expect(next).toHaveBeenCalled();
  });
});
