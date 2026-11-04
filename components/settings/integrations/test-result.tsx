"use client";

import { jsonBody, requestJson } from "@/lib/fetch-json";
import { apiPath } from "@/lib/public-path";
import { cn } from "@/lib/utils";

export function Badge({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        on
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          : "bg-muted text-muted-foreground",
      )}
    >
      {on ? "enabled" : "not configured"}
    </span>
  );
}

export function TestResult({
  ok,
  error,
}: {
  ok: string | null;
  error: string | null;
}) {
  return (
    <>
      {ok ? (
        <p className="text-xs text-green-800 dark:text-green-200">{ok}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}

export async function postTest<T extends { ok?: boolean; error?: string }>(
  path: string,
  body: unknown,
  fallback = "Could not send test.",
): Promise<T> {
  const result = await requestJson<T>(
    apiPath(path),
    { method: "POST", ...jsonBody(body) },
  );
  if (!result.ok) {
    throw new Error(result.error || fallback);
  }
  const data = (result.data ?? {}) as T;
  if (data.ok === false) {
    throw new Error(
      typeof data.error === "string" && data.error ? data.error : fallback,
    );
  }
  return data;
}
