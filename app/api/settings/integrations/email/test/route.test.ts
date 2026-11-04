import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeAppSetting, makeUser } from "@/test/helpers/fixtures";
import { jsonRequest } from "@/test/helpers/request";

const { isEmailConfigured, sendEmailTest } = vi.hoisted(() => ({
  isEmailConfigured: vi.fn(),
  sendEmailTest: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/email", () => ({
  isEmailConfigured,
  sendEmailTest,
}));

import { getCurrentUser } from "@/lib/session";
import { POST } from "./route";

const getCurrentUserMock = vi.mocked(getCurrentUser);

const admin = () =>
  makeUser({ id: "admin_1", role: "admin", email: "admin@example.com" });

function testRequest(body: unknown = { to: "Ada@Example.com" }) {
  return jsonRequest("/api/settings/integrations/email/test", body);
}

describe("POST /api/settings/integrations/email/test", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockResolvedValue(admin());
    isEmailConfigured.mockReset();
    isEmailConfigured.mockResolvedValue(true);
    sendEmailTest.mockReset();
    sendEmailTest.mockResolvedValue({ to: "ada@example.com", ok: true });
  });

  it("returns 401 when the caller is not logged in", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(testRequest());
    expect(res.status).toBe(401);
    expect(sendEmailTest).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an admin", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser({ role: "user" }));
    const res = await POST(testRequest());
    expect(res.status).toBe(403);
    expect(sendEmailTest).not.toHaveBeenCalled();
  });

  it("returns 409 when email is not configured", async () => {
    isEmailConfigured.mockResolvedValue(false);
    const res = await POST(testRequest());
    expect(res.status).toBe(409);
    expect(sendEmailTest).not.toHaveBeenCalled();
  });

  it("returns 400 when the address is missing", async () => {
    const res = await POST(testRequest({}));
    expect(res.status).toBe(400);
    expect(sendEmailTest).not.toHaveBeenCalled();
  });

  it("returns 400 when the address is invalid", async () => {
    const res = await POST(testRequest({ to: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(sendEmailTest).not.toHaveBeenCalled();
  });

  it("persists the recipient per admin then sends", async () => {
    const res = await POST(testRequest({ to: "Ada@Example.com" }));
    expect(res.status).toBe(200);
    expect(sendEmailTest).toHaveBeenCalledWith("ada@example.com");
    await expect(res.json()).resolves.toEqual({
      ok: true,
      to: "ada@example.com",
    });
    expect(mockDb.rows(schema.appSetting)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "email.testTo.admin_1",
          value: "ada@example.com",
        }),
      ]),
    );
  });

  it("saves the address even when SMTP fails", async () => {
    sendEmailTest.mockResolvedValue({
      to: "ada@example.com",
      ok: false,
      error: "relay denied",
    });
    const res = await POST(testRequest({ to: "ada@example.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      to: "ada@example.com",
      error: "relay denied",
    });
    expect(
      mockDb.rows(schema.appSetting).some(
        (r) => r.key === "email.testTo.admin_1" && r.value === "ada@example.com",
      ),
    ).toBe(true);
  });

  it("uses a generic error when SMTP fails without a reason", async () => {
    sendEmailTest.mockResolvedValue({
      to: "ada@example.com",
      ok: false,
    });
    const res = await POST(testRequest({ to: "ada@example.com" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      to: "ada@example.com",
      error: "Could not send the test email.",
    });
  });

  it("does not overwrite a previous address when the body is invalid", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({
        key: "email.testTo.admin_1",
        value: "keep@example.com",
      }),
    ]);
    const res = await POST(testRequest({ to: "nope" }));
    expect(res.status).toBe(400);
    expect(mockDb.rows(schema.appSetting)[0]?.value).toBe("keep@example.com");
  });
});
