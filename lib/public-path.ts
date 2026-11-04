/**
 * Public URL prefix. Empty in local dev; `/your-prefix` when
 * `NEXT_PUBLIC_BASE_PATH` is set at build time. `next/link` and
 * `redirect()` honour `basePath` automatically; `fetch("/api/…")` does not.
 */
export function appBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!raw || raw === "/") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function apiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${appBasePath()}${p}`;
}

export function eventApiPath(code: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return apiPath(`/api/e/${encodeURIComponent(code)}${p}`);
}

export function revealApiPath(token: string, path = ""): string {
  const p = path && (path.startsWith("/") ? path : `/${path}`);
  return apiPath(`/api/reveal/${encodeURIComponent(token)}${p}`);
}

export function photoUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return apiPath(`/api/uploads/${encodeURIComponent(filename)}`);
}

/** Better Auth mount path, including Next.js `basePath` when set. */
export function authBasePath(): string {
  return `${appBasePath()}/api/auth`;
}

function configuredAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  );
}

/** Public site URL, including a path prefix when the app is mounted under one. */
export function appBaseUrl(): string {
  return configuredAppUrl().replace(/\/+$/, "");
}

export function guestPortalUrl(base: string, token: string) {
  return `${base.replace(/\/+$/, "")}/${token}`;
}

/**
 * Scheme + host only. Better Auth's `withPath()` skips appending
 * `/api/auth` when the configured URL already has a path, which would
 * 404 every sign-in under a path prefix such as `/your-prefix`.
 */
export function publicOrigin(): string {
  const raw = configuredAppUrl();
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

/**
 * Origin the browser auth client should call. Using the page origin
 * avoids `Failed to fetch` when the dev server is not on port 3000.
 */
export function authClientOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return publicOrigin();
}

/** Origins Better Auth accepts for CSRF checks. */
export function authTrustedOrigins(): string[] {
  const origins = [publicOrigin()];
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:*", "http://127.0.0.1:*");
  }
  return origins;
}

/**
 * Next.js strips `basePath` from `request.url` before the Better Auth
 * catch-all runs. Restore `{basePath}/api/auth` when missing.
 */
export function withAuthPath(request: Request): Request {
  const prefix = appBasePath();
  if (!prefix) return request;
  const url = new URL(request.url);
  const mount = authBasePath();
  if (url.pathname === mount || url.pathname.startsWith(`${mount}/`)) {
    return request;
  }
  if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
    url.pathname = `${prefix}${url.pathname}`;
    return new Request(url, request);
  }
  return request;
}
