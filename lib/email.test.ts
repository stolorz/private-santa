import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeSettingRows } from "@/test/helpers/fixtures";
import { resetSettingsCache } from "@/lib/settings";
import { EMAIL_BANNER_CID } from "@/lib/templates";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

const sendMail = vi.hoisted(() => vi.fn());
const closeTransport = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() =>
  vi.fn(() => ({ sendMail, close: closeTransport })),
);

vi.mock("nodemailer", () => ({
  default: { createTransport },
  createTransport,
}));

const winterBannerAttachment = {
  filename: "winter-banner.png",
  path: path.join(process.cwd(), "public", "email", "winter-banner.png"),
  cid: EMAIL_BANNER_CID,
  contentDisposition: "inline" as const,
  contentType: "image/png",
};

function stubSmtpSettings(
  overrides: {
    host?: string;
    port?: string;
    user?: string;
    pass?: string;
    from?: string;
  } = {},
) {
  mockDb.seed(
    schema.appSetting,
    makeSettingRows({
      "email.host": overrides.host ?? "smtp.test.dev",
      "email.port": overrides.port ?? "587",
      "email.user": overrides.user ?? "santa@test.dev",
      "email.password": overrides.pass ?? "secret",
      "email.from": overrides.from ?? "Santa <santa@test.dev>",
    }),
  );
}

afterEach(async () => {
  const { resetMailClient } = await import("@/lib/email");
  resetMailClient();
});

describe("isEmailConfigured", () => {
  it("is false when mailbox fields are missing", async () => {
    const { isEmailConfigured } = await import("@/lib/email");
    expect(await isEmailConfigured()).toBe(false);
  });

  it("is false when only the host is set", async () => {
    stubSmtpSettings({ user: "", pass: "", from: "" });
    const { isEmailConfigured } = await import("@/lib/email");
    expect(await isEmailConfigured()).toBe(false);
  });

  it("is true when host, user, password and from are set", async () => {
    stubSmtpSettings();
    const { isEmailConfigured } = await import("@/lib/email");
    expect(await isEmailConfigured()).toBe(true);
  });
});

describe("sendEmailBatch", () => {
  beforeEach(() => {
    sendMail.mockReset();
    closeTransport.mockClear();
    createTransport.mockClear();
    stubSmtpSettings();
  });

  it("returns an empty list without opening SMTP", async () => {
    const { sendEmailBatch } = await import("@/lib/email");
    await expect(sendEmailBatch([])).resolves.toEqual([]);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("throws when the mailbox is not configured", async () => {
    mockDb.seed(schema.appSetting, []);
    resetSettingsCache();
    const { sendEmailBatch } = await import("@/lib/email");
    await expect(
      sendEmailBatch([
        {
          to: "ada@example.com",
          subject: "Hi",
          text: "Hi",
          revealToken: "tok",
        },
      ]),
    ).rejects.toThrow(/Email not configured/);
  });

  it("falls back to the SMTP host when From has no domain", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    stubSmtpSettings({ from: "Santa" });
    const { sendEmailBatch } = await import("@/lib/email");
    await sendEmailBatch([
      {
        to: "giver@example.com",
        subject: "Your match",
        text: "hello",
        revealToken: "tokada",
      },
    ]);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "<santa.tokada@smtp.test.dev>",
      }),
    );
  });

  it("sends via SMTP and returns ok: true on success", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const { sendEmailBatch, SANTA_TOKEN_HEADER } = await import("@/lib/email");

    const results = await sendEmailBatch([
      {
        to: "giver@example.com",
        subject: "Your match",
        text: "hello",
        revealToken: "tokada",
      },
    ]);

    expect(results).toEqual([{ to: "giver@example.com", ok: true }]);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.test.dev",
        port: 587,
        secure: false,
        auth: { user: "santa@test.dev", pass: "secret" },
      }),
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Santa <santa@test.dev>",
        envelope: { from: "santa@test.dev", to: ["giver@example.com"] },
        to: "giver@example.com",
        subject: "Your match",
        text: "hello",
        attachments: [winterBannerAttachment],
        headers: { [SANTA_TOKEN_HEADER]: "tokada" },
        messageId: "<santa.tokada@test.dev>",
      }),
    );
  });

  it("uses port 465 as implicit TLS", async () => {
    stubSmtpSettings({ port: "465" });
    sendMail.mockResolvedValue({});
    const { sendEmailBatch } = await import("@/lib/email");
    await sendEmailBatch([
      {
        to: "giver@example.com",
        subject: "s",
        text: "t",
        revealToken: "abc",
      },
    ]);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("wraps escaped text in the card layout (& < >)", async () => {
    sendMail.mockResolvedValue({});
    const { sendEmailBatch } = await import("@/lib/email");

    await sendEmailBatch([
      {
        to: "giver@example.com",
        subject: "Your match",
        text: "A & B <C>",
        revealToken: "tok",
      },
    ]);

    const [mail] = sendMail.mock.calls[0] as unknown as [
      { text: string; html: string },
    ];
    expect(mail.text).toBe("A & B <C>");
    expect(mail.html).toMatch(/<p [^>]*>A &amp; B &lt;C&gt;<\/p>/);
    expect(mail.html).toContain("background-color:#e6eef6");
    expect(mail.html).toContain(`src="cid:${EMAIL_BANNER_CID}"`);
  });

  it("uses the provided html instead of wrapping text", async () => {
    sendMail.mockResolvedValue({});
    const { sendEmailBatch } = await import("@/lib/email");

    await sendEmailBatch([
      {
        to: "giver@example.com",
        subject: "Your match",
        text: "plain <b>text</b>",
        html: "<strong>custom</strong>",
        revealToken: "tok",
      },
    ]);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: "<strong>custom</strong>",
        text: "plain <b>text</b>",
      }),
    );
  });

  it("maps thrown errors to { ok: false } without throwing", async () => {
    sendMail.mockRejectedValue(new Error("relay denied"));
    const { sendEmailBatch } = await import("@/lib/email");

    const results = await sendEmailBatch([
      {
        to: "giver@example.com",
        subject: "Your match",
        text: "hello",
        revealToken: "tok",
      },
    ]);

    expect(results).toEqual([
      { to: "giver@example.com", ok: false, error: "relay denied" },
    ]);
  });

  it("returns per-recipient results for mixed success and failure", async () => {
    sendMail
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("bounce"))
      .mockRejectedValueOnce(new Error("timeout"));
    const { sendEmailBatch } = await import("@/lib/email");

    const results = await sendEmailBatch([
      { to: "ok@example.com", subject: "s", text: "t", revealToken: "a" },
      { to: "err@example.com", subject: "s", text: "t", revealToken: "b" },
      { to: "throw@example.com", subject: "s", text: "t", revealToken: "c" },
    ]);

    expect(results).toEqual([
      { to: "ok@example.com", ok: true },
      { to: "err@example.com", ok: false, error: "bounce" },
      { to: "throw@example.com", ok: false, error: "timeout" },
    ]);
  });

  it("reuses the transporter for the same mailbox", async () => {
    sendMail.mockResolvedValue({});
    const { sendEmailBatch } = await import("@/lib/email");
    await sendEmailBatch([
      { to: "a@example.com", subject: "s", text: "t", revealToken: "a" },
    ]);
    await sendEmailBatch([
      { to: "b@example.com", subject: "s", text: "t", revealToken: "b" },
    ]);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(closeTransport).not.toHaveBeenCalled();
  });

  it("opens a new transporter when the mailbox changes", async () => {
    sendMail.mockResolvedValue({});
    const { sendEmailBatch } = await import("@/lib/email");
    await sendEmailBatch([
      { to: "a@example.com", subject: "s", text: "t", revealToken: "a" },
    ]);
    stubSmtpSettings({ port: "465" });
    resetSettingsCache();
    await sendEmailBatch([
      { to: "b@example.com", subject: "s", text: "t", revealToken: "b" },
    ]);
    expect(createTransport).toHaveBeenCalledTimes(2);
    expect(closeTransport).toHaveBeenCalledTimes(1);
  });
});

describe("clipEmailFailReason", () => {
  it("trims, collapses whitespace, and clips at 300 characters", async () => {
    const { clipEmailFailReason } = await import("@/lib/email");
    expect(clipEmailFailReason("  mailbox   full  ")).toBe("mailbox full");
    const long = "x".repeat(400);
    const clipped = clipEmailFailReason(long);
    expect(clipped).toHaveLength(300);
    expect(clipped.endsWith("…")).toBe(true);
  });
});

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    sendMail.mockReset();
    closeTransport.mockClear();
    createTransport.mockClear();
    stubSmtpSettings();
  });

  it("sends without a santa token or message-id", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const { sendTransactionalEmail, SANTA_TOKEN_HEADER } =
      await import("@/lib/email");
    await expect(
      sendTransactionalEmail({
        to: "ada@example.com",
        subject: "Confirm",
        text: "Open this link",
      }),
    ).resolves.toEqual({ to: "ada@example.com", ok: true });
    const [mail] = sendMail.mock.calls[0] as unknown as [
      { headers?: unknown; messageId?: unknown; text: string; html: string },
    ];
    expect(mail.text).toBe("Open this link");
    expect(mail.html).toContain("Open this link");
    expect(mail.headers).toBeUndefined();
    expect(mail.messageId).toBeUndefined();
    expect(JSON.stringify(mail)).not.toContain(SANTA_TOKEN_HEADER);
  });

  it("uses the provided html", async () => {
    sendMail.mockResolvedValue({});
    const { sendTransactionalEmail } = await import("@/lib/email");
    await sendTransactionalEmail({
      to: "ada@example.com",
      subject: "Confirm",
      text: "plain",
      html: "<p>custom</p>",
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ html: "<p>custom</p>", text: "plain" }),
    );
  });

  it("maps Error instances and other throws without throwing", async () => {
    sendMail.mockRejectedValueOnce(new Error("boom"));
    const { sendTransactionalEmail } = await import("@/lib/email");
    await expect(
      sendTransactionalEmail({
        to: "ada@example.com",
        subject: "Confirm",
        text: "Open this link",
      }),
    ).resolves.toEqual({
      to: "ada@example.com",
      ok: false,
      error: "boom",
    });
    sendMail.mockRejectedValue("relay denied");
    await expect(
      sendTransactionalEmail({
        to: "ada@example.com",
        subject: "Confirm",
        text: "Open this link",
      }),
    ).resolves.toEqual({
      to: "ada@example.com",
      ok: false,
      error: "relay denied",
    });
  });
});

describe("sendEmailTest", () => {
  beforeEach(() => {
    sendMail.mockReset();
    closeTransport.mockClear();
    createTransport.mockClear();
    stubSmtpSettings();
  });

  it("sends a test message with the dummy reveal token", async () => {
    sendMail.mockResolvedValue({ messageId: "1" });
    const { sendEmailTest, EMAIL_TEST_TOKEN, SANTA_TOKEN_HEADER } =
      await import("@/lib/email");

    await expect(sendEmailTest("ada@example.com")).resolves.toEqual({
      to: "ada@example.com",
      ok: true,
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Private Santa test",
        attachments: [winterBannerAttachment],
        headers: { [SANTA_TOKEN_HEADER]: EMAIL_TEST_TOKEN },
        messageId: `<santa.${EMAIL_TEST_TOKEN}@test.dev>`,
      }),
    );
  });

  it("treats an empty batch as an indeterminate failure", async () => {
    const { emailResultFromBatch } = await import("@/lib/email");
    expect(emailResultFromBatch([], "ada@example.com")).toEqual({
      to: "ada@example.com",
      ok: false,
      error: "Could not determine if the send was successful.",
    });
  });
});
