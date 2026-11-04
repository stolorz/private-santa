import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleGet, handlePost } = vi.hoisted(() => ({
  handleGet: vi.fn(async (req: Request) => new Response(req.url)),
  handlePost: vi.fn(async (req: Request) => new Response(req.url)),
}));

vi.mock("@/lib/auth", () => ({ auth: {} }));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: handleGet, POST: handlePost }),
}));

import * as rateLimit from "@/lib/rate-limit";
import { GET, POST } from "./route";

describe("/api/auth/[...all]", () => {
  beforeEach(() => {
    handleGet.mockClear();
    handlePost.mockClear();
  });

  it("forwards GET after restoring basePath on /api/auth", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix");
    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "GET",
    });

    const res = await GET(req);
    expect(await res.text()).toBe(
      "http://localhost/your-prefix/api/auth/sign-in/email",
    );
    expect(handleGet).toHaveBeenCalledTimes(1);
  });

  it("leaves an already-mounted auth path alone", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix");
    const req = new Request(
      "http://localhost/your-prefix/api/auth/ok",
      { method: "POST" },
    );

    const res = await POST(req);
    expect(await res.text()).toBe(
      "http://localhost/your-prefix/api/auth/ok",
    );
  });

  it("does not rewrite when basePath is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    const req = new Request("http://localhost/api/auth/session");
    const res = await GET(req);
    expect(await res.text()).toBe("http://localhost/api/auth/session");
  });

  it("returns 429 for POST sign-in when the auth limiter blocks", async () => {
    vi.spyOn(rateLimit, "consumeRateLimit").mockReturnValue({
      ok: false,
      retryAfterSec: 42,
    });
    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(handlePost).not.toHaveBeenCalled();
  });

  it("forwards POST sign-in when the limiter allows", async () => {
    vi.spyOn(rateLimit, "consumeRateLimit").mockReturnValue({ ok: true });
    const req = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(handlePost).toHaveBeenCalledTimes(1);
  });

  it("does not rate-limit other POST auth paths", async () => {
    vi.spyOn(rateLimit, "consumeRateLimit").mockReturnValue({
      ok: false,
      retryAfterSec: 42,
    });
    const req = new Request("http://localhost/api/auth/ok", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(handlePost).toHaveBeenCalledTimes(1);
  });
});
