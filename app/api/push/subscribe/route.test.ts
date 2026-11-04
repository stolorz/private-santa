import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makePushSubscription, makeUser } from "@/test/helpers/fixtures";
import { jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { getCurrentUser } from "@/lib/session";
import { DELETE, POST } from "./route";

const getCurrentUserMock = vi.mocked(getCurrentUser);

const admin = () => makeUser({ role: "admin" });

describe("/api/push/subscribe", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue(admin());
    mockDb.seed(schema.user, [admin()]);
  });

  it("returns 401 when the caller is not logged in", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await POST(
      jsonRequest("/api/push/subscribe", {
        endpoint: "https://push.example/1",
        keys: { p256dh: "p", auth: "a" },
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mockDb.rows(schema.pushSubscription)).toHaveLength(0);
  });

  it("returns 401 when the caller is not an admin", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: "user" }));

    const res = await POST(
      jsonRequest("/api/push/subscribe", {
        endpoint: "https://push.example/1",
        keys: { p256dh: "p", auth: "a" },
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mockDb.rows(schema.pushSubscription)).toHaveLength(0);
  });

  it("saves the subscription for an admin", async () => {
    const res = await POST(
      jsonRequest("/api/push/subscribe", {
        endpoint: "https://push.example/1",
        keys: { p256dh: "p", auth: "a" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.pushSubscription)).toEqual([
      expect.objectContaining({
        userId: "user_1",
        endpoint: "https://push.example/1",
        p256dh: "p",
        auth: "a",
      }),
    ]);
  });

  it("rejects an invalid subscription", async () => {
    const res = await POST(
      jsonRequest("/api/push/subscribe", { endpoint: "not-a-url" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid subscription.",
    });
  });

  it("DELETE removes the matching endpoint", async () => {
    mockDb.seed(schema.pushSubscription, [
      makePushSubscription({
        id: 1,
        endpoint: "https://push.example/device",
      }),
      makePushSubscription({
        id: 2,
        endpoint: "https://push.example/keep",
      }),
    ]);

    const res = await DELETE(
      jsonRequest(
        "/api/push/subscribe",
        { endpoint: "https://push.example/device" },
        { method: "DELETE" },
      ),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.pushSubscription).map((row) => row.id)).toEqual([
      2,
    ]);
  });
});
