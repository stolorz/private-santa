import { beforeEach, describe, expect, it, vi } from "vitest";

const { getIntegrationsView, setPushSettings } = vi.hoisted(() => ({
  getIntegrationsView: vi.fn(),
  setPushSettings: vi.fn(),
}));
const generateVapidKeys = vi.hoisted(() =>
  vi.fn(() => ({ publicKey: "pub", privateKey: "priv" })),
);

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
  setPushSettings,
}));

vi.mock("@/lib/push", () => ({
  generateVapidKeys,
}));

import { POST } from "./route";
import { emptyRequest } from "@/test/helpers/request";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


describe("POST /api/settings/integrations/push", () => {
  beforeEach(async () => {
    await asAdmin();
    getIntegrationsView.mockReset();
    setPushSettings.mockReset();
    generateVapidKeys.mockClear();
    getIntegrationsView.mockResolvedValue({ push: { configured: true } });
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await POST(emptyRequest("/api/settings/integrations/push", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(generateVapidKeys).not.toHaveBeenCalled();
  });

  it("stores a generated VAPID key pair", async () => {
    const res = await POST(emptyRequest("/api/settings/integrations/push", { method: "POST" }));

    expect(res.status).toBe(200);
    expect(generateVapidKeys).toHaveBeenCalledTimes(1);
    expect(setPushSettings).toHaveBeenCalledWith({
      publicKey: "pub",
      privateKey: "priv",
    });
  });
});
