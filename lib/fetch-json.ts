export type JsonResult<T> =
  | { ok: true; data: T; error: null; status: number }
  | { ok: false; data: null; error: string; status: number };

function errorFromBody(json: unknown, status: number): string {
  if (json && typeof json === "object" && "error" in json) {
    const value = (json as { error: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return status ? `Request failed (${status}).` : "Network error.";
}

export function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function displayFetchError(error: string, fallback?: string): string {
  if (fallback && error.startsWith("Request failed")) return fallback;
  return error;
}

export function postPhoto<T>(url: string, file: File): Promise<JsonResult<T>> {
  const form = new FormData();
  form.append("file", file);
  return requestJson<T>(url, { method: "POST", body: form });
}

/** Fetch JSON without throwing. Invalid JSON on success is treated as `null`. */
export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<JsonResult<T>> {
  try {
    const res = await fetch(input, init);
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error: errorFromBody(json, res.status),
        status: res.status,
      };
    }
    return { ok: true, data: json as T, error: null, status: res.status };
  } catch {
    return { ok: false, data: null, error: "Network error.", status: 0 };
  }
}
