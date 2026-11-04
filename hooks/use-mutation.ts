"use client";

import { useCallback, useRef, useState } from "react";
import { displayFetchError, type JsonResult } from "@/lib/fetch-json";

export type MutationOptions<TArg, TData> = {
  fallbackError?: string;
  onSuccess?: (data: TData, arg: TArg) => void;
};

export function useMutation<TArg, TData>(
  fn: (arg: TArg) => Promise<JsonResult<TData>>,
  options: MutationOptions<TArg, TData> = {},
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
  }, []);

  const run = useCallback(async (arg: TArg): Promise<JsonResult<TData>> => {
    setBusy(true);
    setError(null);
    try {
      const result = await fnRef.current(arg);
      if (!result.ok) {
        const message = displayFetchError(
          result.error,
          optionsRef.current.fallbackError,
        );
        setError(message);
        return { ...result, error: message };
      }
      optionsRef.current.onSuccess?.(result.data, arg);
      return result;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : (optionsRef.current.fallbackError ?? "Request failed.");
      setError(message);
      return { ok: false, data: null, error: message, status: 0 };
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error, setError, reset };
}
