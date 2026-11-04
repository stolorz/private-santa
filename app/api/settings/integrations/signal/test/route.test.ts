import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/helpers/request";

const { sendSignalTest } = vi.hoisted(() => ({
  sendSignalTest: vi.fn(),
}));
const { isSignalConfigured } = vi.hoisted(() => ({
  isSignalConfigured: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/signal", () => ({
  sendSignalTest,
}));

vi.mock("@/lib/signal-store", () => ({
  isSignalConfigured,
}));

import { POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


describe("POST /api/settings/integrations/signal/test", () => {
  beforeEach(async () => {
    await asAdmin();
    isSignalConfigured.mockReset();
    isSignalConfigured.mockReturnValue(true);
    sendSignalTest.mockReset();
    sendSignalTest.mockResolvedValue({ to: "self", ok: true });
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await POST(jsonRequest("/api/settings/integrations/signal/test", { to: "self" }));
    expect(res.status).toBe(401);
    expect(sendSignalTest).not.toHaveBeenCalled();
  });

  it("returns 409 when Signal is not linked", async () => {
    isSignalConfigured.mockReturnValue(false);
    const res = await POST(jsonRequest("/api/settings/integrations/signal/test", { to: "self" }));
    expect(res.status).toBe(409);
    expect(sendSignalTest).not.toHaveBeenCalled();
  });

  it("returns 400 when the recipient is missing", async () => {
    const res = await POST(jsonRequest("/api/settings/integrations/signal/test", {}));
    expect(res.status).toBe(400);
    expect(sendSignalTest).not.toHaveBeenCalled();
  });

  it("sends a test to Note to Self", async () => {
    const res = await POST(
      jsonRequest("/api/settings/integrations/signal/test", { to: "self" }),
    );
    expect(res.status).toBe(200);
    expect(sendSignalTest).toHaveBeenCalledWith("self");
    await expect(res.json()).resolves.toEqual({ to: "self", ok: true });
  });

  it("returns 400 when the recipient is not a Signal target", async () => {
    sendSignalTest.mockRejectedValue(
      new Error("Choose Note to Self or a Signal contact."),
    );
    const res = await POST(
      jsonRequest("/api/settings/integrations/signal/test", { to: "--help" }),
    );
    expect(res.status).toBe(400);
  });

  it("maps send throws to 500", async () => {
    sendSignalTest.mockRejectedValue(new Error("timeout"));
    const res = await POST(
      jsonRequest("/api/settings/integrations/signal/test", { to: "self" }),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "timeout" });
  });

  it("maps a non-Error throw to a generic 500", async () => {
    sendSignalTest.mockRejectedValue("offline");
    const res = await POST(
      jsonRequest("/api/settings/integrations/signal/test", { to: "self" }),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not send a Signal test.",
    });
  });

  it("returns send failures without throwing", async () => {
    sendSignalTest.mockResolvedValue({
      to: "+15550101",
      ok: false,
      error: "not registered",
    });
    const res = await POST(
      jsonRequest("/api/settings/integrations/signal/test", { to: "+15550101" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      to: "+15550101",
      ok: false,
      error: "not registered",
    });
  });
});
