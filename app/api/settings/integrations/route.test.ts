import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRequest, jsonRequest } from "@/test/helpers/request";

const {
  getIntegrationsView,
  setWhatsAppSettings,
  setEmailSettings,
  setPushSettings,
  clearWhatsAppSettings,
  clearEmailSettings,
  clearPushSettings,
} = vi.hoisted(() => ({
  getIntegrationsView: vi.fn(),
  setWhatsAppSettings: vi.fn(),
  setEmailSettings: vi.fn(),
  setPushSettings: vi.fn(),
  clearWhatsAppSettings: vi.fn(),
  clearEmailSettings: vi.fn(),
  clearPushSettings: vi.fn(),
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
  setWhatsAppSettings,
  setEmailSettings,
  setPushSettings,
  clearWhatsAppSettings,
  clearEmailSettings,
  clearPushSettings,
}));

import { GET, PUT } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

const VIEW = {
  whatsapp: {
    configured: true,
    tokenSet: true,
    phoneId: "phone-1",
    template: "tpl",
    language: "en_US",
    source: "db",
  },
  email: {
    configured: false,
    passwordSet: false,
    host: "",
    port: "587",
    user: "",
    from: "",
    imapHost: "",
    imapPort: "993",
    source: "none",
    testTo: "",
  },
  push: {
    configured: false,
    publicKey: "",
    subject: "mailto:admin@example.com",
    source: "none",
  },
  signal: {
    configured: false,
    linking: false,
    preparing: false,
    linkUrl: null,
    qrDataUrl: null,
    error: null,
    accountNumber: null,
  },
};

describe("/api/settings/integrations", () => {
  beforeEach(async () => {
    await asAdmin({ id: "admin_1", email: "admin@example.com" });
    getIntegrationsView.mockReset();
    setWhatsAppSettings.mockReset();
    setEmailSettings.mockReset();
    setPushSettings.mockReset();
    clearWhatsAppSettings.mockReset();
    clearEmailSettings.mockReset();
    clearPushSettings.mockReset();
    getIntegrationsView.mockResolvedValue(VIEW);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await GET(emptyRequest("/api/settings/integrations"));

    expect(res.status).toBe(401);
  });

  it("loads the view for the current admin", async () => {
    const res = await GET(emptyRequest("/api/settings/integrations"));

    expect(res.status).toBe(200);
    expect(getIntegrationsView).toHaveBeenCalledWith({
      userId: "admin_1",
      fallbackEmail: "admin@example.com",
    });
    await expect(res.json()).resolves.toEqual(VIEW);
  });

  it("saves email settings", async () => {
    const patch = {
      host: "smtp.test",
      port: "587",
      user: "santa@test.dev",
      password: "secret",
      from: "Santa <santa@test.dev>",
    };
    const res = await PUT(
      jsonRequest("/api/settings/integrations", { email: patch }, { method: "PUT" }),
    );
    expect(res.status).toBe(200);
    expect(setEmailSettings).toHaveBeenCalledWith(patch);
  });

  it("saves WhatsApp settings", async () => {
    const patch = {
      token: "tok",
      phoneId: "phone-1",
      template: "tpl",
      language: "en_US",
    };

    const res = await PUT(
      jsonRequest("/api/settings/integrations", { whatsapp: patch }, { method: "PUT" }),
    );

    expect(res.status).toBe(200);
    expect(setWhatsAppSettings).toHaveBeenCalledWith(patch);
    await expect(res.json()).resolves.toEqual(VIEW);
  });

  it("clears a channel when the field is null", async () => {
    const res = await PUT(
      jsonRequest("/api/settings/integrations", { email: null }, { method: "PUT" }),
    );

    expect(res.status).toBe(200);
    expect(clearEmailSettings).toHaveBeenCalledTimes(1);
    expect(setEmailSettings).not.toHaveBeenCalled();
  });

  it("clears WhatsApp and push, and saves a push subject", async () => {
    const cleared = await PUT(
      jsonRequest(
        "/api/settings/integrations",
        { whatsapp: null, push: null },
        { method: "PUT" },
      ),
    );
    expect(cleared.status).toBe(200);
    expect(clearWhatsAppSettings).toHaveBeenCalledTimes(1);
    expect(clearPushSettings).toHaveBeenCalledTimes(1);

    const saved = await PUT(
      jsonRequest(
        "/api/settings/integrations",
        { push: { subject: "mailto:ops@example.com" } },
        { method: "PUT" },
      ),
    );
    expect(saved.status).toBe(200);
    expect(setPushSettings).toHaveBeenCalledWith({
      subject: "mailto:ops@example.com",
    });
  });
});
