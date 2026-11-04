import { NextRequest } from "next/server";
import { FIXTURE_EVENT_CODE } from "@/test/helpers/fixtures";

type RequestInitFull = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
type RequestInitWithoutBody = Omit<RequestInitFull, "body">;

/**
 * Wrap a JSON body in a `NextRequest` for calling App Router handlers.
 *
 * Relative paths are resolved against `http://localhost`.
 *
 *   await POST(jsonRequest("/api/e/xmas_20260101/draw", { name: "Office" }));
 *   await PUT(jsonRequest("/api/e/xmas_20260101/me", { phone: "" }, { method: "PUT" }));
 */
export function emptyRequest(
  url = "http://localhost/",
  init: RequestInitFull = {},
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

export function jsonRequest(
  url: string,
  body: unknown,
  init: RequestInitWithoutBody = {},
): NextRequest {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return emptyRequest(url, {
    ...init,
    method: init.method ?? "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

export function codeParams(
  code = FIXTURE_EVENT_CODE,
  extra: Record<string, string> = {},
) {
  return routeParams({ code, ...extra });
}

export function formRequest(
  url: string,
  form: FormData,
  init: RequestInitWithoutBody = {},
): NextRequest {
  return emptyRequest(url, {
    ...init,
    method: init.method ?? "POST",
    body: form,
  });
}

export function tokenParams<E extends Record<string, string> = Record<string, never>>(
  token: string,
  extra?: E,
) {
  return routeParams({ token, ...(extra ?? {}) } as { token: string } & E);
}

export function jpegForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}
