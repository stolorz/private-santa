import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import {
  badRequest,
  catchDomainErrors,
  parseJson,
  parseRouteId,
  requireAdminUser,
  requireUser,
  route,
} from "@/lib/api";
import { PersonError } from "@/lib/errors";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeEvent, makeSeries } from "@/test/helpers/fixtures";
import {
  codeParams,
  emptyRequest,
  jsonRequest,
  tokenParams,
} from "@/test/helpers/request";
import { asAdmin, asAnonymous, asUser } from "@/test/helpers/session";

describe("parseRouteId", () => {
  it("parses numeric ids and rejects NaN", () => {
    expect(parseRouteId("12")).toBe(12);
    expect(parseRouteId("abc")).toBeNull();
  });

  it("rejects empty strings, zero, decimals and scientific notation", () => {
    expect(parseRouteId("")).toBeNull();
    expect(parseRouteId("0")).toBeNull();
    expect(parseRouteId("1.5")).toBeNull();
    expect(parseRouteId("1e3")).toBeNull();
    expect(parseRouteId("9007199254740993")).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns 401 when there is no logged-in user", async () => {
    await asAnonymous();

    const result = await requireUser();

    expect(result.user).toBeNull();
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(401);
    await expect(result.response!.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("returns the user when logged in", async () => {
    const user = await asUser({ id: "user_42", name: "Ada" });

    const result = await requireUser();

    expect(result.user).toEqual(user);
    expect(result.response).toBeNull();
  });
});

describe("requireAdminUser", () => {
  it("returns 401 when there is no logged-in user", async () => {
    await asAnonymous();

    const result = await requireAdminUser();

    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    await asUser();

    const result = await requireAdminUser();

    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(403);
  });

  it("returns the admin user", async () => {
    const user = await asAdmin();

    const result = await requireAdminUser();

    expect(result.user).toEqual(user);
    expect(result.response).toBeNull();
  });
});

describe("parseJson", () => {
  it("returns 400 when the body is not JSON", async () => {
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api", {
      method: "POST",
      body: "nope",
    });
    const result = await parseJson(req, z.object({ n: z.number() }), "Invalid.");
    expect(result.response?.status).toBe(400);
  });

  it("returns parsed data for a valid body", async () => {
    const result = await parseJson(
      jsonRequest("/api", { n: 3 }),
      z.object({ n: z.number() }),
    );
    expect(result.data).toEqual({ n: 3 });
    expect(result.response).toBeUndefined();
  });

  it("uses a Zod custom issue message", async () => {
    const schema = z.object({ n: z.number() }).superRefine((_val, ctx) => {
      ctx.addIssue({ code: "custom", message: "Nope." });
    });
    const result = await parseJson(
      jsonRequest("/api", { n: 1 }),
      schema,
      "Invalid.",
    );
    expect(result.response?.status).toBe(400);
    await expect(result.response!.json()).resolves.toEqual({ error: "Nope." });
  });
});

describe("catchDomainErrors", () => {
  it("maps DomainError to its HTTP status", async () => {
    const response = await catchDomainErrors(async () => {
      throw new PersonError("Several people share that name.", 400);
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Several people share that name.",
    });
  });

  it("rethrows non-domain errors", async () => {
    await expect(
      catchDomainErrors(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("route()", () => {
  it("returns 404 Unknown event for eventAdmin", async () => {
    await asAdmin();
    const GET = route({ auth: "eventAdmin" }, async ({ event }) =>
      NextResponse.json({ code: event.code }),
    );
    const res = await GET(
      emptyRequest("/api/e/zzzzzz/x"),
      codeParams("zzzzzz"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Unknown event." });
  });

  it("loads the edition for eventAdmin", async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    const GET = route({ auth: "eventAdmin" }, async ({ event }) =>
      NextResponse.json({ code: event.code }),
    );
    const res = await GET(emptyRequest("/api/e/x/x"), codeParams());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      code: "xmas_20260101",
    });
  });

  it("returns 404 for an invalid guest token", async () => {
    const GET = route({ auth: "guest" }, async ({ link }) =>
      NextResponse.json({ id: link.assignment.id }),
    );
    const res = await GET(
      emptyRequest("/api/reveal/notarealtok"),
      tokenParams("notarealtok"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "This link is invalid.",
    });
  });

  it("returns 400 Invalid id when opts.id is set", async () => {
    await asAdmin();
    const DELETE = route({ auth: "admin", id: true }, async () =>
      NextResponse.json({ ok: true }),
    );
    const res = await DELETE(emptyRequest("/api/x/0"), {
      params: Promise.resolve({ id: "0" }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid id." });
  });

  it("treats missing route params as empty", async () => {
    await asAdmin();
    const eventGet = route({ auth: "eventAdmin" }, async ({ event }) =>
      NextResponse.json({ code: event.code }),
    );
    expect((await eventGet(emptyRequest("/api/e/x"))).status).toBe(404);

    const guestGet = route({ auth: "guest" }, async ({ link }) =>
      NextResponse.json({ id: link.assignment.id }),
    );
    expect((await guestGet(emptyRequest("/api/reveal/x"))).status).toBe(404);

    const byId = route({ auth: "admin", id: true }, async () =>
      NextResponse.json({ ok: true }),
    );
    const res = await byId(emptyRequest("/api/x"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid id." });
  });

  it("rethrows non-domain errors from the handler", async () => {
    const GET = route({ auth: "public" }, async () => {
      throw new Error("boom");
    });
    await expect(GET(emptyRequest("/api/x"))).rejects.toThrow("boom");
  });

  it("returns 429 before the handler when the rate limit is exceeded", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const GET = route({ auth: "public", rateLimit: "signup" }, async () =>
      NextResponse.json({ ok: true }),
    );
    const headers = { "x-forwarded-for": "203.0.113.50" };
    for (let i = 0; i < 5; i++) {
      expect((await GET(emptyRequest("/api/signup", { headers }))).status).toBe(
        200,
      );
    }
    const res = await GET(emptyRequest("/api/signup", { headers }));
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "Too many requests. Try again later.",
    });
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("badRequest", () => {
  it("returns 400 JSON with the given message", async () => {
    const response = badRequest("Name is required");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Name is required",
    });
  });
});
