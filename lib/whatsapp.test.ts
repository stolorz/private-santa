import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeSettingRows } from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

function seedWhatsApp(
  overrides: {
    token?: string;
    phoneId?: string;
    template?: string;
    language?: string;
  } = {},
) {
  const language = overrides.language === undefined ? "pt_PT" : overrides.language;
  mockDb.seed(
    schema.appSetting,
    makeSettingRows({
      "wa.token": overrides.token ?? "tok_abc",
      "wa.phoneId": overrides.phoneId ?? "phone-123",
      "wa.template": overrides.template ?? "secret_santa",
      "wa.language": language,
    }),
  );
}

function parsedBody(call: unknown[]) {
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe("isWhatsAppConfigured", () => {
  it("is false when nothing is stored", async () => {
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp");
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it("is false without a phone number id", async () => {
    seedWhatsApp({ phoneId: "" });
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp");
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it("is false without a token", async () => {
    seedWhatsApp({ token: "" });
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp");
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it("is false without a template name", async () => {
    seedWhatsApp({ template: "" });
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp");
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it("is false without a template language", async () => {
    seedWhatsApp({ language: "" });
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp");
    expect(await isWhatsAppConfigured()).toBe(false);
  });

  it("is true when token, phone id, template name, and language are stored", async () => {
    seedWhatsApp();
    const { isWhatsAppConfigured } = await import("@/lib/whatsapp");
    expect(await isWhatsAppConfigured()).toBe(true);
  });
});

describe("sendBatch", () => {
  beforeEach(() => {
    seedWhatsApp();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );
  });

  it("throws when WhatsApp is not configured", async () => {
    mockDb.seed(schema.appSetting, []);
    const { sendBatch } = await import("@/lib/whatsapp");
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
      ]),
    ).rejects.toThrow(/WhatsApp not configured/);
  });

  it("POSTs to Graph v19.0 with template body params [giverName, secondParam]", async () => {
    const { sendBatch } = await import("@/lib/whatsapp");

    const results = await sendBatch([
      {
        to: "351912345678",
        giverName: "Ana",
        secondParam: "Bruno",
      },
    ]);

    expect(results).toEqual([{ to: "351912345678", ok: true }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v19.0/phone-123/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer tok_abc",
          "Content-Type": "application/json",
        },
      }),
    );

    expect(parsedBody(vi.mocked(fetch).mock.calls[0])).toEqual({
      messaging_product: "whatsapp",
      to: "351912345678",
      type: "template",
      template: {
        name: "secret_santa",
        language: { code: "pt_PT" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ana" },
              { type: "text", text: "Bruno" },
            ],
          },
        ],
      },
    });
  });

  it("throws when the template language is missing", async () => {
    seedWhatsApp({ language: "" });
    const { sendBatch } = await import("@/lib/whatsapp");

    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
      ]),
    ).rejects.toThrow(/WhatsApp not configured/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the stored template language", async () => {
    seedWhatsApp({ language: "en_US" });
    const { sendBatch } = await import("@/lib/whatsapp");

    await sendBatch([
      { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
    ]);

    expect(parsedBody(vi.mocked(fetch).mock.calls[0]).template.language).toEqual(
      { code: "en_US" },
    );
  });

  it("maps HTTP non-OK responses to { ok: false } and never throws", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("invalid template", { status: 400 }),
    );
    const { sendBatch } = await import("@/lib/whatsapp");

    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
      ]),
    ).resolves.toEqual([
      {
        to: "351911111111",
        ok: false,
        error: "HTTP 400: invalid template",
      },
    ]);
  });

  it("maps a non-Error throw to { ok: false }", async () => {
    vi.mocked(fetch).mockRejectedValue("offline");
    const { sendBatch } = await import("@/lib/whatsapp");

    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
      ]),
    ).resolves.toEqual([
      { to: "351911111111", ok: false, error: "offline" },
    ]);
  });

  it("maps network throws to { ok: false } and never throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("socket hang up"));
    const { sendBatch } = await import("@/lib/whatsapp");

    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
      ]),
    ).resolves.toEqual([
      { to: "351911111111", ok: false, error: "socket hang up" },
    ]);
  });

  it("returns per-recipient results when some sends fail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockRejectedValueOnce(new Error("timeout"));
    const { sendBatch } = await import("@/lib/whatsapp");

    const results = await sendBatch([
      { to: "351911111111", giverName: "Ana", secondParam: "Bruno" },
      { to: "351922222222", giverName: "Cara", secondParam: "Diogo" },
    ]);

    expect(results).toEqual([
      { to: "351911111111", ok: true },
      { to: "351922222222", ok: false, error: "timeout" },
    ]);
  });
});
