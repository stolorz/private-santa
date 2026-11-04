import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "@/test/helpers/fixtures";
import { jsonRequest } from "@/test/helpers/request";

const { sendPushTest } = vi.hoisted(() => ({
  sendPushTest: vi.fn(),
}));
const { getPushConfig } = vi.hoisted(() => ({
  getPushConfig: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/integrations", () => ({
  getPushConfig,
}));

vi.mock("@/lib/push", () => ({
  sendPushTest,
}));

import { getCurrentUser } from "@/lib/session";
import { POST } from "./route";

const getCurrentUserMock = vi.mocked(getCurrentUser);

const admin = () => makeUser({ id: "admin_1", role: "admin" });
const endpoint = "https://push.example/me";

function configuredPush() {
  getPushConfig.mockResolvedValue({
    publicKey: "pub",
    privateKey: "priv",
    subject: "mailto:admin@example.com",
  });
}

function testRequest(body: unknown = { endpoint }) {
  return jsonRequest("/api/settings/integrations/push/test", body);
}

describe("POST /api/settings/integrations/push/test", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue(admin());
    getPushConfig.mockReset();
    configuredPush();
    sendPushTest.mockReset();
    sendPushTest.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it("returns 401 when the caller is not logged in", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(testRequest());
    expect(res.status).toBe(401);
    expect(sendPushTest).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an admin", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: "user" }));
    const res = await POST(testRequest());
    expect(res.status).toBe(403);
    expect(sendPushTest).not.toHaveBeenCalled();
  });

  it("returns 409 when Web Push is not configured", async () => {
    getPushConfig.mockResolvedValue({
      publicKey: "",
      privateKey: "",
      subject: "mailto:admin@example.com",
    });
    const res = await POST(testRequest());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Web Push is not configured.",
    });
    expect(sendPushTest).not.toHaveBeenCalled();
  });

  it("returns 400 when the endpoint is missing", async () => {
    const res = await POST(testRequest({}));
    expect(res.status).toBe(400);
    expect(sendPushTest).not.toHaveBeenCalled();
  });

  it("returns 409 when this browser has no stored subscription", async () => {
    sendPushTest.mockResolvedValue({ sent: 0, failed: 0 });
    const res = await POST(testRequest());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Enable push notifications on this device first.",
    });
    expect(sendPushTest).toHaveBeenCalledWith("admin_1", endpoint);
  });

  it("sends a test to the current browser endpoint", async () => {
    const res = await POST(testRequest());
    expect(res.status).toBe(200);
    expect(sendPushTest).toHaveBeenCalledWith("admin_1", endpoint);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sent: 1,
      failed: 0,
    });
  });

  it("returns send failures without throwing", async () => {
    sendPushTest.mockResolvedValue({ sent: 0, failed: 1 });
    const res = await POST(testRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      sent: 0,
      failed: 1,
      error: "Could not deliver the test notification.",
    });
  });
});
