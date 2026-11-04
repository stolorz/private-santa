/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMutation } from "@/hooks/use-mutation";
import type { JsonResult } from "@/lib/fetch-json";

function ok<T>(data: T): JsonResult<T> {
  return { ok: true, data, error: null, status: 200 };
}

function fail(error: string, status = 400): JsonResult<never> {
  return { ok: false, data: null, error, status };
}

describe("useMutation", () => {
  it("calls onSuccess and clears busy on a successful result", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useMutation(async (n: number) => ok(n * 2), { onSuccess }),
    );

    let response: JsonResult<number> | undefined;
    await act(async () => {
      response = await result.current.run(3);
    });

    expect(response).toEqual(ok(6));
    expect(onSuccess).toHaveBeenCalledWith(6, 3);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a fetch error and swaps Request failed for the fallback", async () => {
    const { result } = renderHook(() =>
      useMutation(async () => fail("Request failed (500).", 500), {
        fallbackError: "Could not save.",
      }),
    );

    await act(async () => {
      await result.current.run(undefined);
    });

    expect(result.current.error).toBe("Could not save.");
  });

  it("keeps a specific error message", async () => {
    const { result } = renderHook(() =>
      useMutation(async () => fail("Name is required.")),
    );

    await act(async () => {
      await result.current.run(undefined);
    });

    expect(result.current.error).toBe("Name is required.");
  });

  it("catches thrown Errors and non-Errors", async () => {
    const thrown = renderHook(() =>
      useMutation(async () => {
        throw new Error("offline");
      }),
    );
    await act(async () => {
      await thrown.result.current.run(undefined);
    });
    expect(thrown.result.current.error).toBe("offline");

    const fallback = renderHook(() =>
      useMutation(
        async () => {
          throw "nope";
        },
        { fallbackError: "Request failed." },
      ),
    );
    await act(async () => {
      await fallback.result.current.run(undefined);
    });
    expect(fallback.result.current.error).toBe("Request failed.");

    const defaulted = renderHook(() =>
      useMutation(async () => {
        throw "nope";
      }),
    );
    await act(async () => {
      await defaulted.result.current.run(undefined);
    });
    expect(defaulted.result.current.error).toBe("Request failed.");
  });

  it("reset and setError update state", async () => {
    const { result } = renderHook(() =>
      useMutation(async () => fail("boom")),
    );
    await act(async () => {
      await result.current.run(undefined);
    });
    expect(result.current.error).toBe("boom");

    act(() => {
      result.current.setError("later");
    });
    expect(result.current.error).toBe("later");

    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("marks busy while the mutation is in flight", async () => {
    let release!: () => void;
    const pending = new Promise<JsonResult<string>>((resolve) => {
      release = () => resolve(ok("done"));
    });
    const { result } = renderHook(() => useMutation(async () => pending));
    act(() => {
      void result.current.run(undefined);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => {
      release();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
  });
});
