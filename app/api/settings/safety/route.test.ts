import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRequest } from "@/test/helpers/request";

const { authSecretStatus, rotateAuthSecret } = vi.hoisted(() => ({
  authSecretStatus: vi.fn(),
  rotateAuthSecret: vi.fn(),
}));
const signOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/auth-secret", () => ({
  authSecretStatus,
  rotateAuthSecret,
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: { signOut },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { GET, POST } from "./route";
import { asAdmin, asAnonymous, asUser } from "@/test/helpers/session";

const STATUS = { source: "BETTER_AUTH_SECRET" as const, weak: false };

describe("/api/settings/safety", () => {
  beforeEach(async () => {
    await asAdmin();
    authSecretStatus.mockReset();
    rotateAuthSecret.mockReset();
    signOut.mockReset();
    authSecretStatus.mockReturnValue(STATUS);
    rotateAuthSecret.mockResolvedValue(STATUS);
    signOut.mockResolvedValue(undefined);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const getRes = await GET(emptyRequest("/api/settings/safety"));
    const postRes = await POST(
      emptyRequest("/api/settings/safety", { method: "POST" }),
    );

    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
    expect(rotateAuthSecret).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is signed in but not an admin", async () => {
    await asUser();

    const res = await GET(emptyRequest("/api/settings/safety"));

    expect(res.status).toBe(403);
    expect(authSecretStatus).not.toHaveBeenCalled();
  });

  it("returns the current secret status without the secret", async () => {
    const res = await GET(emptyRequest("/api/settings/safety"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(STATUS);
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("rotates the secret, signs out, and still omits the secret", async () => {
    rotateAuthSecret.mockResolvedValue({
      source: "BETTER_AUTH_SECRET",
      weak: false,
    });

    const res = await POST(
      emptyRequest("/api/settings/safety", { method: "POST" }),
    );

    expect(res.status).toBe(200);
    expect(rotateAuthSecret).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({ ok: true, ...STATUS });
    expect(JSON.stringify(body)).not.toMatch(/BETTER_AUTH_SECRET=/);
  });
});
