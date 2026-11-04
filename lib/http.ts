import { NextResponse } from "next/server";

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function unavailable(message: string) {
  return NextResponse.json({ error: message }, { status: 503 });
}

export const TOO_MANY_REQUESTS = "Too many requests. Try again later.";

export function tooManyRequests(retryAfterSec = 60) {
  const retryAfter = String(Math.max(1, Math.ceil(retryAfterSec)));
  return NextResponse.json(
    { error: TOO_MANY_REQUESTS },
    {
      status: 429,
      headers: { "Retry-After": retryAfter },
    },
  );
}
