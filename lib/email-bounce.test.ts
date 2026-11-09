import { beforeEach, describe, expect, it, vi } from "vitest";

const { ImapFlow } = vi.hoisted(() => ({
  ImapFlow: vi.fn(),
}));

vi.mock("imapflow", () => ({ ImapFlow }));
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAppSetting,
  makeAssignment,
  makeDraw,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
  makeSettingRows,
  makeUser,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { EMAIL_TEST_TOKEN } from "@/lib/email";
import {
  applyEmailBounce,
  parseBounceMessage,
  pollEmailBounces,
} from "@/lib/email-bounce";

const DSN = `From: Mail Delivery Subsystem <mailer-daemon@example.com>
Subject: Undelivered Mail Returned to Sender
Content-Type: multipart/report; report-type=delivery-status; boundary="X"

--X
Content-Type: text/plain

The message could not be delivered.

--X
Content-Type: message/delivery-status

Final-Recipient: rfc822; bea@example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 User unknown

--X
Content-Type: message/rfc822

X-Santa-Token: tok-bea
Message-ID: <santa.tok-bea@example.com>
To: bea@example.com

Hi Bea
--X--
`;

const REPLY = `From: Bea <bea@example.com>
Subject: Re: your private link
To: santa@test.dev

Thanks!
`;

describe("parseBounceMessage", () => {
  it("extracts token, recipient and diagnostic from a DSN", () => {
    expect(parseBounceMessage(DSN)).toEqual({
      token: "tok-bea",
      recipients: ["bea@example.com"],
      reason: "smtp; 550 5.1.1 User unknown",
    });
  });

  it("returns null for ordinary incoming mail", () => {
    expect(parseBounceMessage(REPLY)).toBeNull();
  });

  it("treats Action: failed as a bounce and uses Status when Diagnostic-Code is missing", () => {
    const raw = `From: postmaster@example.com
Action: failed
Status: 5.2.2
Original-Recipient: rfc822; ada@example.com
Original-Recipient: rfc822; ada@example.com
`;
    expect(parseBounceMessage(raw)).toEqual({
      token: null,
      recipients: ["ada@example.com"],
      reason: "Status 5.2.2",
    });
  });

  it("returns Bounce when no status headers are present", () => {
    const raw = `Content-Type: message/delivery-status
Final-Recipient: rfc822; ada@example.com
`;
    expect(parseBounceMessage(raw)).toEqual({
      token: null,
      recipients: ["ada@example.com"],
      reason: "Bounce",
    });
  });

  it("reads a token from the santa Message-ID and a Subject reason", () => {
    const raw = `From: Mail Delivery Subsystem <mailer-daemon@example.com>
Subject: Undelivered Mail Returned to Sender
Message-ID: <santa.toktoktoktok@example.com>
Final-Recipient: rfc822; ada@example.com
`;
    expect(parseBounceMessage(raw)).toEqual({
      token: "toktoktoktok",
      recipients: ["ada@example.com"],
      reason: "Undelivered Mail Returned to Sender",
    });
  });

  it("returns null when a report has no token or recipients", () => {
    expect(
      parseBounceMessage("Content-Type: multipart/report; report-type=delivery-status"),
    ).toBeNull();
  });

  it("ignores a Final-Recipient line that is not an email", () => {
    const raw = `Content-Type: message/delivery-status
Final-Recipient: rfc822; not-an-address
X-Santa-Token: toktoktoktok leftover
`;
    expect(parseBounceMessage(raw)).toEqual({
      token: "toktoktoktok",
      recipients: [],
      reason: "Bounce",
    });
  });

  it("matches a mailer-daemon bounce by failed recipients only", () => {
    const raw = `From: Mailer-Daemon@host.example
Subject: Delivery Status Notification (Failure)
X-Failed-Recipients: ada@example.com

Could not deliver.
`;
    expect(parseBounceMessage(raw)).toEqual({
      token: null,
      recipients: ["ada@example.com"],
      reason: "Delivery Status Notification (Failure)",
    });
  });
});

describe("applyEmailBounce", () => {
  beforeEach(() => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("marks the assignment for a matching reveal token", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        revealToken: "tok-bea",
        deliveredEmail: true,
      }),
    ]);

    await expect(
      applyEmailBounce({
        token: "tok-bea",
        recipients: ["bea@example.com"],
        reason: "550 user unknown",
      }),
    ).resolves.toBe(true);

    expect(mockDb.rows(schema.assignment)[0]).toMatchObject({
      emailFailed: true,
      emailFailedReason: "550 user unknown",
      deliveredEmail: true,
    });
  });

  it("falls back to the giver email on a completed draw", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", email: "ada@example.com" }),
      makePerson({ id: 2, name: "Bea", email: "bea@example.com" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        status: "completed",
        executedAt: new Date("2026-01-01"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "tok-ada",
        deliveredEmail: true,
      }),
    ]);

    await expect(
      applyEmailBounce({
        token: null,
        recipients: ["ada@example.com"],
        reason: "mailbox full",
      }),
    ).resolves.toBe(true);

    expect(mockDb.rows(schema.assignment)[0]).toMatchObject({
      emailFailed: true,
      emailFailedReason: "mailbox full",
    });
  });

  it("matches a linked login email when the person row has none", async () => {
    mockDb.seed(schema.user, [
      makeUser({ id: "user_bea", email: "bea@example.com" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({
        id: 2,
        name: "Bea",
        email: null,
        userId: "user_bea",
      }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 2, personId: 2 })]);
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, status: "completed", executedAt: new Date() }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 2,
        revealToken: "tok-bea",
      }),
    ]);

    await expect(
      applyEmailBounce({
        token: "missing",
        recipients: ["bea@example.com"],
        reason: "bounce",
      }),
    ).resolves.toBe(true);

    expect(mockDb.rows(schema.assignment)[0]?.emailFailed).toBe(true);
  });

  it("ignores the integrations test token and does not fall back to the recipient", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", email: "ada@example.com" }),
      makePerson({ id: 2, name: "Bea", email: "bea@example.com" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        status: "completed",
        executedAt: new Date("2026-01-01"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "tok-ada",
        deliveredEmail: true,
      }),
    ]);

    await expect(
      applyEmailBounce({
        token: EMAIL_TEST_TOKEN,
        recipients: ["ada@example.com"],
        reason: "550 user unknown",
      }),
    ).resolves.toBe(false);

    expect(mockDb.rows(schema.assignment)[0]?.emailFailed).toBe(false);
  });

  it("marks the newest completed assignment when the token is missing", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, code: "later1", occursOn: "2026-12-25" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", email: "ada@example.com" }),
      makePerson({ id: 2, name: "Bea", email: "bea@example.com" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 3, eventId: 2, personId: 1 }),
      makeGuest({ id: 4, eventId: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        eventId: 1,
        status: "completed",
        executedAt: new Date("2025-01-01"),
      }),
      makeDraw({
        id: 2,
        eventId: 2,
        status: "completed",
        executedAt: new Date("2026-12-01"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "tok-old",
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 2,
        drawId: 2,
        giverId: 3,
        receiverId: 4,
        revealToken: "tok-new",
        deliveredEmail: false,
      }),
    ]);

    await expect(
      applyEmailBounce({
        token: null,
        recipients: ["ada@example.com"],
        reason: "mailbox full",
      }),
    ).resolves.toBe(true);

    const rows = mockDb.rows(schema.assignment);
    expect(rows.find((row) => row.id === 1)).toMatchObject({
      emailFailed: false,
    });
    expect(rows.find((row) => row.id === 2)).toMatchObject({
      emailFailed: true,
      emailFailedReason: "mailbox full",
    });
  });

  it("skips IMAP when the mailbox is not configured", async () => {
    await expect(pollEmailBounces()).resolves.toBe(0);
  });

  it("returns false when nothing matches", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [makeAssignment({ revealToken: "other" })]);

    await expect(
      applyEmailBounce({
        token: null,
        recipients: [],
        reason: "bounce",
      }),
    ).resolves.toBe(false);
    await expect(
      applyEmailBounce({
        token: "nope",
        recipients: ["nobody@example.com"],
        reason: "bounce",
      }),
    ).resolves.toBe(false);
    expect(mockDb.rows(schema.assignment)[0]?.emailFailed).toBe(false);
  });
});

function stubMailboxSettings() {
  mockDb.seed(
    schema.appSetting,
    makeSettingRows({
      "email.host": "imap.test.dev",
      "email.user": "santa@test.dev",
      "email.password": "secret",
      "email.from": "Santa <santa@test.dev>",
      "email.imapHost": "imap.test.dev",
    }),
  );
}

function mockImap(opts: {
  uidValidity?: string;
  uidNext?: number;
  mailbox?: null;
  messages?: Array<{ uid: number; source: unknown }>;
  connectError?: Error;
  flagsError?: boolean;
}) {
  const release = vi.fn();
  const client = {
    mailbox:
      opts.mailbox === null
        ? null
        : {
            uidValidity: opts.uidValidity ?? "1",
            uidNext: opts.uidNext ?? 3,
          },
    connect: vi.fn(async () => {
      if (opts.connectError) throw opts.connectError;
    }),
    getMailboxLock: vi.fn(async () => ({ release })),
    fetch: vi.fn(async function* () {
      for (const msg of opts.messages ?? []) yield msg;
    }),
    messageFlagsAdd: vi.fn(async () => {
      if (opts.flagsError) throw new Error("flags");
    }),
    logout: vi.fn(async () => {}),
  };
  ImapFlow.mockImplementation(function ImapMock() {
    return client;
  });
  return { client, release };
}

describe("pollEmailBounces IMAP", () => {
  beforeEach(() => {
    stubMailboxSettings();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        revealToken: "tok-bea",
        deliveredEmail: true,
      }),
    ]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not connect when no IMAP host is stored", async () => {
    mockDb.seed(
      schema.appSetting,
      makeSettingRows({
        "email.host": "smtp.test.dev",
        "email.user": "santa@test.dev",
        "email.password": "secret",
        "email.from": "Santa <santa@test.dev>",
      }),
    );
    ImapFlow.mockClear();

    await expect(pollEmailBounces()).resolves.toBe(0);
    expect(ImapFlow).not.toHaveBeenCalled();
  });

  it("reads Uint8Array and stringifies unknown sources", async () => {
    mockImap({
      messages: [
        { uid: 3, source: new Uint8Array(Buffer.from(DSN)) },
        { uid: 4, source: { not: "mail" } },
        { uid: 5, source: null },
      ],
    });
    await expect(pollEmailBounces()).resolves.toBe(1);
  });

  it("applies a DSN and stores the UID cursor", async () => {
    const { client, release } = mockImap({
      messages: [{ uid: 2, source: DSN }],
      flagsError: true,
    });
    await expect(pollEmailBounces()).resolves.toBe(1);
    expect(mockDb.rows(schema.assignment)[0]?.emailFailed).toBe(true);
    expect(client.messageFlagsAdd).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
    expect(mockDb.rows(schema.appSetting)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "email.imapUid", value: "2" }),
        expect.objectContaining({ key: "email.imapUidValidity", value: "1" }),
      ]),
    );
  });

  it("resets the cursor when uidValidity changes", async () => {
    mockDb.add(
      schema.appSetting,
      makeAppSetting({ key: "email.imapUid", value: "40" }),
      makeAppSetting({ key: "email.imapUidValidity", value: "old" }),
    );
    const { client } = mockImap({
      uidValidity: "new",
      messages: [{ uid: 5, source: Buffer.from(DSN) }],
    });
    await expect(pollEmailBounces()).resolves.toBe(1);
    expect(client.fetch).toHaveBeenCalledWith(
      { seen: false },
      { uid: true, source: true },
    );
  });

  it("fetches by UID when the mailbox cursor is still valid", async () => {
    mockDb.add(
      schema.appSetting,
      makeAppSetting({ key: "email.imapUid", value: "1" }),
      makeAppSetting({ key: "email.imapUidValidity", value: "1" }),
    );
    const { client } = mockImap({
      uidValidity: "1",
      uidNext: 5,
      messages: [{ uid: 2, source: DSN }],
    });
    await expect(pollEmailBounces()).resolves.toBe(1);
    expect(client.fetch).toHaveBeenCalledWith(
      "2:*",
      { uid: true, source: true },
      { uid: true },
    );
  });

  it("defaults missing IMAP cursor fields", async () => {
    const { client } = mockImap({});
    client.mailbox = {
      uidValidity: undefined as unknown as string,
      uidNext: undefined as unknown as number,
    };
    await expect(pollEmailBounces()).resolves.toBe(0);
  });

  it("no-ops when there are no new UIDs", async () => {
    mockDb.add(
      schema.appSetting,
      makeAppSetting({ key: "email.imapUid", value: "10" }),
      makeAppSetting({ key: "email.imapUidValidity", value: "1" }),
    );
    const { client } = mockImap({ uidValidity: "1", uidNext: 11 });
    await expect(pollEmailBounces()).resolves.toBe(0);
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("returns 0 when the mailbox lock has no mailbox", async () => {
    mockImap({ mailbox: null });
    await expect(pollEmailBounces()).resolves.toBe(0);
  });

  it("logs connect failures and returns 0", async () => {
    const { client } = mockImap({ connectError: new Error("offline") });
    client.logout.mockRejectedValue(new Error("already gone"));
    await expect(pollEmailBounces()).resolves.toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 0 when a poll is already running", async () => {
    let releaseConnect!: () => void;
    const hanging = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const client = {
      mailbox: { uidValidity: "1", uidNext: 2 },
      connect: vi.fn(() => hanging),
      getMailboxLock: vi.fn(async () => ({ release: vi.fn() })),
      fetch: vi.fn(async function* () {}),
      messageFlagsAdd: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
    };
    ImapFlow.mockImplementation(function ImapMock() {
      return client;
    });
    const first = pollEmailBounces();
    await Promise.resolve();
    await expect(pollEmailBounces()).resolves.toBe(0);
    releaseConnect();
    await first;
  });
});
