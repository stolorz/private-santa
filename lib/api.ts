import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getEventWithSeriesByCode } from "@/lib/events";
import { DomainError } from "@/lib/errors";
import type { Event, EventSeries, User } from "@/lib/db/schema";
import type { GuestLink } from "@/lib/guest-link";
import { requireGuestLink } from "@/lib/guest-link";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serverError,
  tooManyRequests,
  unavailable,
} from "@/lib/http";
import { clientIp } from "@/lib/request-meta";
import {
  consumeRateLimit,
  type RateLimitBucket,
} from "@/lib/rate-limit";

export {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serverError,
  tooManyRequests,
  unavailable,
};

type AuthUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}

/** 401 when anonymous, 403 when signed in but not admin. */
export async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return { user: null, response: forbidden() };
  }
  return { user, response: null };
}

export function parseRouteId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

export async function parseJson<T>(
  req: NextRequest,
  schema: z.ZodType<T>,
  message = "Invalid request body.",
): Promise<{ data: T; response?: undefined } | { data?: undefined; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: badRequest(message) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue?.code === "custom" ? issue.message : message;
    return { response: badRequest(detail) };
  }
  return { data: parsed.data };
}

async function requireEventAdmin(code: string): Promise<
  | { event: Event; series: EventSeries; response: null }
  | { event: null; series: null; response: NextResponse }
> {
  const found = await getEventWithSeriesByCode(code);
  if (!found) {
    return { event: null, series: null, response: notFound("Unknown event.") };
  }
  return { event: found.event, series: found.series, response: null };
}

export async function catchDomainErrors(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

type RouteParams = Record<string, string>;

type CommonCtx<P extends RouteParams, B> = {
  req: NextRequest;
  params: P;
  body: B;
  id: number;
};

type RouteOpts<B> = {
  id?: boolean;
  body?: z.ZodType<B>;
  invalid?: string;
  rateLimit?: RateLimitBucket;
};

type Handler<P extends RouteParams> = (
  req: NextRequest,
  route?: { params?: Promise<P> },
) => Promise<Response>;

export function route<P extends RouteParams = RouteParams, B = undefined>(
  opts: RouteOpts<B> & { auth: "admin" },
  fn: (ctx: CommonCtx<P, B> & { user: AuthUser }) => Promise<Response>,
): Handler<P>;
export function route<P extends RouteParams = RouteParams, B = undefined>(
  opts: RouteOpts<B> & { auth: "eventAdmin" },
  fn: (
    ctx: CommonCtx<P, B> & {
      user: AuthUser;
      event: Event;
      series: EventSeries;
    },
  ) => Promise<Response>,
): Handler<P>;
export function route<P extends RouteParams = RouteParams, B = undefined>(
  opts: RouteOpts<B> & { auth: "public" },
  fn: (ctx: CommonCtx<P, B>) => Promise<Response>,
): Handler<P>;
export function route<P extends RouteParams = RouteParams, B = undefined>(
  opts: RouteOpts<B> & { auth: "guest" },
  fn: (ctx: CommonCtx<P, B> & { link: GuestLink }) => Promise<Response>,
): Handler<P>;
export function route<P extends RouteParams = RouteParams, B = undefined>(
  opts: RouteOpts<B> & { auth: "user" },
  fn: (ctx: CommonCtx<P, B> & { user: AuthUser }) => Promise<Response>,
): Handler<P>;
export function route<P extends RouteParams = RouteParams, B = undefined>(
  opts: RouteOpts<B> & {
    auth: "admin" | "eventAdmin" | "public" | "guest" | "user";
  },
  fn: (
    ctx: CommonCtx<P, B> & {
      user: AuthUser;
      event: Event;
      series: EventSeries;
      link: GuestLink;
    },
  ) => Promise<Response>,
): Handler<P> {
  return async (req, routeCtx) => {
    const params = ((await routeCtx?.params) ?? {}) as P;

    if (opts.rateLimit) {
      const limited = consumeRateLimit(opts.rateLimit, clientIp(req.headers));
      if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
    }

    let user: AuthUser | undefined;
    if (
      opts.auth === "admin" ||
      opts.auth === "eventAdmin" ||
      opts.auth === "user"
    ) {
      const auth =
        opts.auth === "user" ? await requireUser() : await requireAdminUser();
      if (!auth.user) return auth.response;
      user = auth.user;
    }

    let event: Event | undefined;
    let series: EventSeries | undefined;
    if (opts.auth === "eventAdmin") {
      const found = await requireEventAdmin(params.code ?? "");
      if (found.response) return found.response;
      event = found.event;
      series = found.series;
    }

    let link: GuestLink | undefined;
    if (opts.auth === "guest") {
      const guest = await requireGuestLink(params.token ?? "");
      if (!guest.link) return guest.response;
      link = guest.link;
    }

    let id = 0;
    if (opts.id) {
      const parsed = parseRouteId(String(params.id ?? ""));
      if (parsed == null) return badRequest("Invalid id.");
      id = parsed;
    }

    let body = undefined as B;
    if (opts.body) {
      const parsed = await parseJson(req, opts.body, opts.invalid);
      if (parsed.response) return parsed.response;
      body = parsed.data as B;
    }

    return catchDomainErrors(() =>
      fn({
        req,
        params,
        body,
        id,
        user: user as AuthUser,
        event: event as Event,
        series: series as EventSeries,
        link: link as GuestLink,
      }),
    );
  };
}

export type { User, AuthUser };
