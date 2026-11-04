import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/lib/db";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAppSetting,
  makeEvent,
  makeEventTemplate,
  makePushSubscription,
  makeSettingRows,
  makeUser,
} from "@/test/helpers/fixtures";
import { nameCases } from "@/lib/name-cases";

const setVapidDetails = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());
const generateVAPIDKeys = vi.hoisted(() =>
  vi.fn(() => ({ publicKey: "new-pub", privateKey: "new-priv" })),
);
/** Survive `vi.resetModules()` so tests keep the same mock `db` / schema objects. */
const pinnedLibDb = vi.hoisted(() => ({
  exports: null as Awaited<
    ReturnType<typeof import("@/test/helpers/db").mockLibDb>
  > | null,
}));

vi.mock("web-push", () => {
  const api = { setVapidDetails, sendNotification, generateVAPIDKeys };
  return { default: api, ...api };
});

vi.mock("@/lib/db", async () => {
  if (!pinnedLibDb.exports) {
    const { mockLibDb } = await import("@/test/helpers/db");
    pinnedLibDb.exports = await mockLibDb();
  }
  return pinnedLibDb.exports;
});

async function loadPush() {
  return import("@/lib/push");
}

function stubVapid(overrides: { subject?: string } = {}) {
  mockDb.seed(
    schema.appSetting,
    makeSettingRows({
      "push.publicKey": "public-key",
      "push.privateKey": "private-key",
      "push.subject": overrides.subject ?? "mailto:santa@test.dev",
    }),
  );
}

function webPushError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function seedAdminPush(
  subscriptions: Parameters<typeof makePushSubscription>[0][] = [
    { userId: "admin_1" },
  ],
) {
  mockDb.seed(schema.user, [makeUser({ id: "admin_1", role: "admin" })]);
  mockDb.seed(
    schema.pushSubscription,
    subscriptions.map((overrides, i) =>
      makePushSubscription({ id: i + 1, userId: "admin_1", ...overrides }),
    ),
  );
}

const ada = nameCases("Ada", { gender: "female" });
const payload = {
  title: "🎁 Xmas",
  body: "Ada otworzyła swój prywatny link.",
  url: "/e/xmas_20260101/admin",
};

beforeEach(() => {
  vi.resetModules();
  setVapidDetails.mockReset();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue(undefined);
});

describe("generateVapidKeys", () => {
  it("delegates to web-push", async () => {
    generateVAPIDKeys.mockReturnValue({
      publicKey: "pub",
      privateKey: "priv",
    });
    const { generateVapidKeys } = await loadPush();
    expect(generateVapidKeys()).toEqual({ publicKey: "pub", privateKey: "priv" });
    expect(generateVAPIDKeys).toHaveBeenCalledTimes(1);
  });
});

describe("pushToAdmins", () => {
  it("no-ops when push is unconfigured", async () => {
    seedAdminPush();
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
    expect(mockDb.deletes).toHaveLength(0);
  });

  it("does not send when the subject is missing", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "push.publicKey", value: "db-pub" }),
      makeAppSetting({ key: "push.privateKey", value: "db-priv" }),
    ]);
    seedAdminPush();
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
  });

  it("sends with the stored subject", async () => {
    mockDb.seed(schema.appSetting, [
      makeAppSetting({ key: "push.publicKey", value: "db-pub" }),
      makeAppSetting({ key: "push.privateKey", value: "db-priv" }),
      makeAppSetting({ key: "push.subject", value: "mailto:santa@test.dev" }),
    ]);
    seedAdminPush();
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 1,
      failed: 0,
    });
    expect(setVapidDetails).toHaveBeenCalledWith(
      "mailto:santa@test.dev",
      "db-pub",
      "db-priv",
    );
  });

  it("sends only to admin subscriptions", async () => {
    stubVapid({ subject: "mailto:santa@test.dev" });
    mockDb.seed(schema.user, [
      makeUser({ id: "admin_1", role: "admin" }),
      makeUser({ id: "user_2", role: "user" }),
    ]);
    mockDb.seed(schema.pushSubscription, [
      makePushSubscription({
        id: 1,
        userId: "admin_1",
        endpoint: "https://push.example/admin",
      }),
      makePushSubscription({
        id: 2,
        userId: "user_2",
        endpoint: "https://push.example/guest",
      }),
    ]);
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 1,
      failed: 0,
    });
    expect(setVapidDetails).toHaveBeenCalledWith(
      "mailto:santa@test.dev",
      "public-key",
      "private-key",
    );
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/admin",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
      JSON.stringify(payload),
    );
  });

  it("no-ops when there is no admin", async () => {
    stubVapid();
    mockDb.seed(schema.user, [makeUser({ role: "user" })]);
    mockDb.seed(schema.pushSubscription, [makePushSubscription()]);
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
  });

  it("prunes subscriptions that return 404 or 410", async () => {
    stubVapid();
    seedAdminPush([
      { endpoint: "https://push.example/live" },
      { endpoint: "https://push.example/gone-404" },
      { endpoint: "https://push.example/gone-410" },
    ]);
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("gone-404")) {
        throw webPushError(404, "Not Found");
      }
      if (sub.endpoint.endsWith("gone-410")) {
        throw webPushError(410, "Gone");
      }
    });
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 1,
      failed: 2,
    });

    expect(mockDb.deletes).toHaveLength(1);
    expect(mockDb.deletes[0].table).toBe(schema.pushSubscription);
    expect(mockDb.rows(schema.pushSubscription).map((row) => row.id)).toEqual([
      1,
    ]);
  });

  it("counts other errors as failed without pruning", async () => {
    stubVapid();
    seedAdminPush();
    sendNotification.mockRejectedValue(webPushError(500, "server error"));
    const { pushToAdmins } = await loadPush();

    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 0,
      failed: 1,
    });
    expect(mockDb.deletes).toHaveLength(0);
    expect(mockDb.rows(schema.pushSubscription)).toHaveLength(1);
  });

  it("reuses VAPID details on a second send", async () => {
    stubVapid({ subject: "mailto:santa@test.dev" });
    seedAdminPush();
    const { pushToAdmins } = await loadPush();
    await pushToAdmins(payload);
    await pushToAdmins(payload);
    expect(setVapidDetails).toHaveBeenCalledTimes(1);
  });

  it("counts a throw without a status code as failed", async () => {
    stubVapid();
    seedAdminPush();
    sendNotification.mockRejectedValue(new Error("offline"));
    const { pushToAdmins } = await loadPush();
    await expect(pushToAdmins(payload)).resolves.toEqual({
      sent: 0,
      failed: 1,
    });
    expect(mockDb.deletes).toHaveLength(0);
  });
});

describe("sendPushTest", () => {
  it("no-ops when push is unconfigured", async () => {
    seedAdminPush();
    const { sendPushTest } = await loadPush();

    await expect(
      sendPushTest("admin_1", "https://push.example/1"),
    ).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(setVapidDetails).not.toHaveBeenCalled();
  });

  it("no-ops when the endpoint is not stored for that user", async () => {
    stubVapid();
    mockDb.seed(schema.user, [
      makeUser({ id: "admin_1", role: "admin" }),
      makeUser({ id: "admin_2", role: "admin" }),
    ]);
    mockDb.seed(schema.pushSubscription, [
      makePushSubscription({
        id: 2,
        userId: "admin_2",
        endpoint: "https://push.example/other",
      }),
    ]);
    const { sendPushTest } = await loadPush();

    await expect(
      sendPushTest("admin_1", "https://push.example/other"),
    ).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends only to the requested endpoint", async () => {
    stubVapid();
    mockDb.seed(schema.user, [makeUser({ id: "admin_1", role: "admin" })]);
    mockDb.seed(schema.pushSubscription, [
      makePushSubscription({
        id: 1,
        userId: "admin_1",
        endpoint: "https://push.example/me",
      }),
      makePushSubscription({
        id: 2,
        userId: "admin_1",
        endpoint: "https://push.example/phone",
      }),
    ]);
    const { sendPushTest, PUSH_TEST_TITLE, PUSH_TEST_BODY } = await loadPush();

    await expect(
      sendPushTest("admin_1", "https://push.example/me"),
    ).resolves.toEqual({
      sent: 1,
      failed: 0,
    });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/me",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
      JSON.stringify({
        title: PUSH_TEST_TITLE,
        body: PUSH_TEST_BODY,
        url: "/settings",
        test: true,
      }),
      { TTL: 60, urgency: "high" },
    );
  });

  it("prunes a subscription that returns 410", async () => {
    stubVapid();
    seedAdminPush([{ endpoint: "https://push.example/gone-410" }]);
    sendNotification.mockRejectedValue(webPushError(410, "Gone"));
    const { sendPushTest } = await loadPush();

    await expect(
      sendPushTest("admin_1", "https://push.example/gone-410"),
    ).resolves.toEqual({
      sent: 0,
      failed: 1,
    });
    expect(mockDb.deletes).toHaveLength(1);
    expect(mockDb.rows(schema.pushSubscription)).toHaveLength(0);
  });
});

describe("notifyAdminsOfGuestActivity", () => {
  it("pushes Polish copy and the event admin URL", async () => {
    stubVapid();
    seedAdminPush();
    mockDb.seed(schema.event, [makeEvent()]);
    const { notifyAdminsOfGuestActivity } = await loadPush();

    await notifyAdminsOfGuestActivity({
      kind: "opened",
      giver: ada,
      eventId: 1,
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example/1",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
      JSON.stringify(payload),
    );
  });

  it("uses this edition's push templates", async () => {
    stubVapid();
    seedAdminPush();
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "push.opened.body",
        language: "pl",
        value: "Custom opened {giver}",
      }),
    ]);
    const { notifyAdminsOfGuestActivity } = await loadPush();

    await notifyAdminsOfGuestActivity({
      kind: "opened",
      giver: ada,
      eventId: 1,
    });

    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({
      body: "Custom opened Ada",
    });
  });

  it("uses the unwrapped template on reveal", async () => {
    stubVapid();
    seedAdminPush();
    mockDb.seed(schema.event, [makeEvent()]);
    const { notifyAdminsOfGuestActivity } = await loadPush();

    await notifyAdminsOfGuestActivity({
      kind: "revealed",
      giver: ada,
      eventId: 1,
    });

    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({
      title: "🎁 Xmas",
      body: "Ada sprawdziła, kogo wylosowała.",
      url: "/e/xmas_20260101/admin",
    });
  });

  it("notifies wishlist_added without item text", async () => {
    stubVapid();
    seedAdminPush();
    mockDb.seed(schema.event, [makeEvent()]);
    const { notifyAdminsOfGuestActivity } = await loadPush();

    await notifyAdminsOfGuestActivity({
      kind: "wishlist_added",
      giver: ada,
      eventId: 1,
    });

    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload).toEqual({
      title: "🎁 Xmas",
      body: "Ada dodała coś do swojej listy życzeń.",
      url: "/e/xmas_20260101/admin",
    });
    expect(JSON.stringify(payload)).not.toMatch(/http|book|socks/i);
  });

  it("notifies wishlist_read for the viewer, not the match name", async () => {
    stubVapid();
    seedAdminPush();
    mockDb.seed(schema.event, [makeEvent()]);
    const { notifyAdminsOfGuestActivity } = await loadPush();

    await notifyAdminsOfGuestActivity({
      kind: "wishlist_read",
      giver: ada,
      eventId: 1,
    });

    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({
      title: "🎁 Xmas",
      body: "Ada zajrzała do zaktualizowanej listy życzeń.",
      url: "/e/xmas_20260101/admin",
    });
  });

  it("logs and swallows unexpected errors", async () => {
    stubVapid();
    seedAdminPush();
    const store = await import("@/lib/templates/store");
    vi.spyOn(store, "getEventTemplates").mockRejectedValue(new Error("templates down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { notifyAdminsOfGuestActivity } = await loadPush();
    await notifyAdminsOfGuestActivity({
      kind: "opened",
      giver: ada,
      eventId: 1,
    });
    expect(error).toHaveBeenCalled();
  });

  it("does not throw when push is unconfigured", async () => {
    const { notifyAdminsOfGuestActivity } = await loadPush();

    await expect(
      notifyAdminsOfGuestActivity({
        kind: "opened",
        giver: ada,
        eventId: 1,
      }),
    ).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
