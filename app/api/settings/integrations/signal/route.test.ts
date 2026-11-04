import { beforeEach, describe, expect, it, vi } from "vitest";

const { getIntegrationsView } = vi.hoisted(() => ({
  getIntegrationsView: vi.fn(),
}));
const { startSignalLink, unlinkSignalDevice } = vi.hoisted(() => ({
  startSignalLink: vi.fn(),
  unlinkSignalDevice: vi.fn(),
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
  getIntegrationsView,
  integrationsViewFor: (user: { id?: string; email?: string | null } | null) =>
    getIntegrationsView({
      userId: user?.id,
      fallbackEmail: user?.email ?? undefined,
    }),
}));

vi.mock("@/lib/signal-link", () => ({
  startSignalLink,
  unlinkSignalDevice,
}));

import { DELETE, GET, POST } from "./route";
import { emptyRequest } from "@/test/helpers/request";
import { asAdmin } from "@/test/helpers/session";


describe("/api/settings/integrations/signal", () => {
  beforeEach(async () => {
    await asAdmin();
    getIntegrationsView.mockReset();
    startSignalLink.mockReset();
    unlinkSignalDevice.mockReset();
    getIntegrationsView.mockResolvedValue({
      signal: { configured: false, linking: true },
    });
    startSignalLink.mockResolvedValue(undefined);
  });

  it("GET returns the Signal link status", async () => {
    getIntegrationsView.mockResolvedValue({
      signal: { configured: true, linking: false, accountNumber: "+351" },
    });
    const res = await GET(
      emptyRequest("/api/settings/integrations/signal", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      signal: { configured: true, linking: false, accountNumber: "+351" },
    });
  });

  it("POST starts linking", async () => {
    const res = await POST(emptyRequest("/api/settings/integrations/signal", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(startSignalLink).toHaveBeenCalledTimes(1);
  });

  it("POST maps link failures to 500", async () => {
    startSignalLink.mockRejectedValue(new Error("native missing"));
    const res = await POST(emptyRequest("/api/settings/integrations/signal", { method: "POST" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "native missing" });
  });

  it("DELETE unlinks the device", async () => {
    const res = await DELETE(emptyRequest("/api/settings/integrations/signal", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(unlinkSignalDevice).toHaveBeenCalledTimes(1);
  });

  it("POST maps a non-Error throw to a generic 500", async () => {
    startSignalLink.mockRejectedValue("offline");
    const res = await POST(emptyRequest("/api/settings/integrations/signal", { method: "POST" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not start Signal linking.",
    });
  });

  it("DELETE maps unlink failures to 500", async () => {
    unlinkSignalDevice.mockRejectedValue(new Error("busy"));
    const res = await DELETE(
      emptyRequest("/api/settings/integrations/signal", { method: "DELETE" }),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "busy" });
  });

  it("DELETE maps a non-Error throw to a generic 500", async () => {
    unlinkSignalDevice.mockRejectedValue("gone");
    const res = await DELETE(
      emptyRequest("/api/settings/integrations/signal", { method: "DELETE" }),
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not unlink Signal.",
    });
  });
});
