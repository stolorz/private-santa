import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeAppSetting } from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/signal-link", () => ({
  getSignalLinkStatus: () => ({
    linking: false,
    preparing: false,
    linkUrl: null,
    qrDataUrl: null,
    error: null,
    accountNumber: null,
  }),
}));

vi.mock("@/lib/signal-store", () => ({
  isSignalConfigured: () => false,
}));

import {
  clearEmailSettings,
  clearPushSettings,
  clearWhatsAppSettings,
  getEmailConfig,
  integrationsViewFor,
  getIntegrationsView,
  getPushConfig,
  getWhatsAppConfig,
  isEmailBounceComplete,
  isEmailComplete,
  isPushComplete,
  isWhatsAppComplete,
  setEmailSettings,
  setPushSettings,
  setWhatsAppSettings,
} from "@/lib/integrations";

describe("integration config", () => {
  it("reads WhatsApp from stored settings", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "wa.token", value: "db-token" }),
      makeAppSetting({ key: "wa.phoneId", value: "db-phone" }),
      makeAppSetting({ key: "wa.template", value: "db_tpl" }),
      makeAppSetting({ key: "wa.language", value: "en_US" }),
    ]);

    await expect(getWhatsAppConfig()).resolves.toEqual({
      token: "db-token",
      phoneId: "db-phone",
      template: "db_tpl",
      language: "en_US",
    });
  });

  it("ignores WhatsApp env vars when the DB has no keys", async () => {
    vi.stubEnv("WA_API_TOKEN", "env-token");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "env-phone");
    vi.stubEnv("WA_TEMPLATE_NAME", "env_tpl");
    vi.stubEnv("WA_TEMPLATE_LANGUAGE", "pt_PT");

    await expect(getWhatsAppConfig()).resolves.toEqual({
      token: "",
      phoneId: "",
      template: "",
      language: "",
    });
  });

  it("keeps the stored token when the incoming token is blank", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "wa.token", value: "keep-me" }),
      makeAppSetting({ key: "wa.phoneId", value: "old-phone" }),
    ]);

    await setWhatsAppSettings({
      token: "",
      phoneId: "new-phone",
      template: "secret_santa",
      language: "en_US",
    });

    await expect(getWhatsAppConfig()).resolves.toMatchObject({
      token: "keep-me",
      phoneId: "new-phone",
      template: "secret_santa",
    });
  });

  it("clearWhatsAppSettings drops DB keys even when env vars are set", async () => {
    vi.stubEnv("WA_API_TOKEN", "env-token");
    vi.stubEnv("WA_PHONE_NUMBER_ID", "env-phone");
    vi.stubEnv("WA_TEMPLATE_NAME", "env_tpl");
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "wa.token", value: "db-token" }),
      makeAppSetting({ key: "wa.phoneId", value: "db-phone" }),
      makeAppSetting({ key: "wa.template", value: "db_tpl" }),
    ]);

    await clearWhatsAppSettings();

    await expect(getWhatsAppConfig()).resolves.toMatchObject({
      token: "",
      phoneId: "",
      template: "",
    });
  });

  it("fills email and push only from stored keys", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "email.host", value: "smtp.db.test" }),
      makeAppSetting({ key: "email.password", value: "db-pass" }),
      makeAppSetting({ key: "email.user", value: "santa@db.test" }),
      makeAppSetting({ key: "email.from", value: "Santa <santa@db.test>" }),
      makeAppSetting({ key: "push.publicKey", value: "pub" }),
      makeAppSetting({ key: "push.privateKey", value: "priv" }),
    ]);
    vi.stubEnv("SMTP_FROM", "Env <env@test.dev>");
    vi.stubEnv("SMTP_USER", "env@test.dev");
    vi.stubEnv("VAPID_SUBJECT", "mailto:env@test.dev");

    await expect(getEmailConfig()).resolves.toEqual({
      host: "smtp.db.test",
      port: 587,
      user: "santa@db.test",
      password: "db-pass",
      from: "Santa <santa@db.test>",
      imapHost: "",
      imapPort: 993,
    });
    await expect(getPushConfig()).resolves.toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: "",
    });
  });

  it("keeps the stored mailbox password when the incoming password is blank", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "email.host", value: "smtp.test.dev" }),
      makeAppSetting({ key: "email.password", value: "keep-me" }),
      makeAppSetting({ key: "email.user", value: "old@test.dev" }),
    ]);

    await setEmailSettings({
      password: "",
      user: "santa@test.dev",
      from: "Santa <santa@test.dev>",
    });

    await expect(getEmailConfig()).resolves.toMatchObject({
      password: "keep-me",
      user: "santa@test.dev",
      from: "Santa <santa@test.dev>",
    });
  });

  it("getIntegrationsView hides secrets and reports configured", async () => {
    await setWhatsAppSettings({
      token: "secret-token",
      phoneId: "phone-1",
      template: "tpl",
      language: "en_US",
    });
    await setEmailSettings({
      host: "smtp.test.dev",
      user: "santa@test.dev",
      password: "mail-secret",
      from: "Santa <santa@test.dev>",
    });
    await setPushSettings({
      publicKey: "pub-key",
      privateKey: "priv-key",
      subject: "mailto:santa@test.dev",
    });

    const view = await getIntegrationsView();

    expect(view.whatsapp).toEqual({
      configured: true,
      tokenSet: true,
      phoneId: "phone-1",
      template: "tpl",
      language: "en_US",
      source: "db",
    });
    expect(view.email).toEqual({
      configured: true,
      passwordSet: true,
      host: "smtp.test.dev",
      port: "",
      user: "santa@test.dev",
      from: "Santa <santa@test.dev>",
      imapHost: "",
      imapPort: "",
      source: "db",
      testTo: "",
    });
    expect(view.push).toEqual({
      configured: true,
      publicKey: "pub-key",
      subject: "mailto:santa@test.dev",
      source: "db",
    });
    expect(JSON.stringify(view)).not.toContain("secret-token");
    expect(JSON.stringify(view)).not.toContain("mail-secret");
    expect(JSON.stringify(view)).not.toContain("priv-key");
  });

  it("prefills testTo from the stored per-admin address", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({
        key: "email.testTo.admin_1",
        value: "saved@example.com",
      }),
    ]);

    const view = await getIntegrationsView({
      userId: "admin_1",
      fallbackEmail: "admin@example.com",
    });
    expect(view.email.testTo).toBe("saved@example.com");
  });

  it("falls back to the admin login email when no test address is stored", async () => {
    const view = await getIntegrationsView({
      userId: "admin_1",
      fallbackEmail: "admin@example.com",
    });
    expect(view.email.testTo).toBe("admin@example.com");
  });

  it("leaves WhatsApp incomplete when the template language is missing", async () => {
    await setWhatsAppSettings({
      token: "secret-token",
      phoneId: "phone-1",
      template: "tpl",
    });

    const cfg = await getWhatsAppConfig();
    expect(cfg.language).toBe("");
    expect(isWhatsAppComplete(cfg)).toBe(false);
    const view = await getIntegrationsView();
    expect(view.whatsapp.configured).toBe(false);
    expect(view.whatsapp.language).toBe("");
  });

  it("shows a blank SMTP port in the view and connects on 587", async () => {
    await setEmailSettings({
      host: "smtp.test.dev",
      user: "santa@test.dev",
      password: "mail-secret",
      from: "Santa <santa@test.dev>",
    });

    const cfg = await getEmailConfig();
    expect(cfg.port).toBe(587);
    expect(cfg.imapHost).toBe("");
    expect(cfg.imapPort).toBe(993);
    expect(isEmailComplete(cfg)).toBe(true);
    expect(isEmailBounceComplete(cfg)).toBe(false);

    const view = await getIntegrationsView();
    expect(view.email.configured).toBe(true);
    expect(view.email.port).toBe("");
    expect(view.email.imapHost).toBe("");
    expect(view.email.imapPort).toBe("");
  });

  it("leaves email incomplete when the SMTP port is not a usable integer", async () => {
    for (const port of ["0", "65536", "587abc"]) {
      await setEmailSettings({
        host: "smtp.test.dev",
        port,
        user: "santa@test.dev",
        password: "mail-secret",
        from: "Santa <santa@test.dev>",
      });
      const cfg = await getEmailConfig();
      expect(cfg.port).toBe(0);
      expect(isEmailComplete(cfg)).toBe(false);
    }
  });

  it("leaves bounce polling off when the IMAP port is invalid", async () => {
    await setEmailSettings({
      host: "smtp.test.dev",
      user: "santa@test.dev",
      password: "mail-secret",
      from: "Santa <santa@test.dev>",
      imapHost: "imap.test.dev",
      imapPort: "nope",
    });

    const cfg = await getEmailConfig();
    expect(isEmailComplete(cfg)).toBe(true);
    expect(cfg.imapPort).toBe(0);
    expect(isEmailBounceComplete(cfg)).toBe(false);
    const view = await getIntegrationsView();
    expect(view.email.imapHost).toBe("imap.test.dev");
    expect(view.email.imapPort).toBe("nope");
  });

  it("leaves push incomplete when the subject is missing", async () => {
    await setPushSettings({ publicKey: "pub", privateKey: "priv" });

    const cfg = await getPushConfig();
    expect(cfg.subject).toBe("");
    expect(isPushComplete(cfg)).toBe(false);
    const view = await getIntegrationsView();
    expect(view.push.configured).toBe(false);
    expect(view.push.subject).toBe("");
  });

  it("keeps testTo after mailbox settings are cleared", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "email.host", value: "smtp.test.dev" }),
      makeAppSetting({
        key: "email.testTo.admin_1",
        value: "saved@example.com",
      }),
    ]);
    await clearEmailSettings();
    const view = await getIntegrationsView({ userId: "admin_1" });
    expect(view.email.testTo).toBe("saved@example.com");
    expect(view.email.host).toBe("");
  });
});

describe("push settings and view helpers", () => {
  it("ignores VAPID env vars when the DB is empty", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "env-pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "env-priv");
    const view = await getIntegrationsView();
    expect(view.push.source).toBe("none");
    expect(view.push.publicKey).toBe("");
  });

  it("keeps the current secret when the incoming value is omitted", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "push.privateKey", value: "keep-me" }),
      makeAppSetting({ key: "push.publicKey", value: "pub" }),
    ]);
    await setPushSettings({ publicKey: "pub" });
    await expect(getPushConfig()).resolves.toMatchObject({
      privateKey: "keep-me",
      publicKey: "pub",
    });
  });

  it("clears stored push keys", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "push.publicKey", value: "pub" }),
      makeAppSetting({ key: "push.privateKey", value: "priv" }),
    ]);
    await clearPushSettings();
    await expect(getPushConfig()).resolves.toMatchObject({
      publicKey: "",
      privateKey: "",
    });
  });

  it("integrationsViewFor forwards the user email", async () => {
    const view = await integrationsViewFor({
      id: "admin_1",
      email: "admin@example.com",
    });
    expect(view.email.testTo).toBe("admin@example.com");
  });

  it("integrationsViewFor accepts a user without email", async () => {
    const view = await integrationsViewFor({ id: "admin_1", email: null });
    expect(view.email.testTo).toBe("");
  });
});
