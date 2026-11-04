import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeEventTemplate,
  makeDraw,
  makeEvent,
  makeGuest,
  makeInvitationSend,
  makePerson,
  makeSeries,
  makeUser,
  polishNameCases,
  eventLocation,
  eventNameTranslations,
} from "@/test/helpers/fixtures";

const {
  isWhatsAppConfigured,
  sendBatch,
  isSignalConfigured,
  sendSignalBatch,
  isEmailConfigured,
  sendEmailBatch,
} = vi.hoisted(() => ({
  isWhatsAppConfigured: vi.fn(() => false),
  sendBatch: vi.fn(
    async (inputs: Array<{ to: string }>) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
  ),
  isSignalConfigured: vi.fn(() => false),
  sendSignalBatch: vi.fn(
    async (inputs: Array<{ to: string }>) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
  ),
  isEmailConfigured: vi.fn(() => false),
  sendEmailBatch: vi.fn(
    async (inputs: Array<{ to: string; text?: string }>) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
  ),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured,
  sendBatch,
}));

vi.mock("@/lib/signal", () => ({
  isSignalConfigured,
  sendBatch: sendSignalBatch,
}));

vi.mock("@/lib/email", () => ({
  isEmailConfigured,
  sendEmailBatch,
  clipEmailFailReason: (reason: string) => reason.trim().replace(/\s+/g, " "),
}));

import { MISSING_EVENT_DATE_SEND_REASON } from "@/lib/event-date";
import * as eventsLib from "@/lib/events";
import {
  ALL_RECEIVED_REASON,
  EVENT_PAST_REASON,
  NO_CHANNELS_REASON,
  NO_DRAW_REASON,
  NONE_REACHABLE_REASON,
  NO_PRIOR_SEND_REASON,
  REMAINING_UNREACHABLE_REASON,
} from "@/lib/invitation-channels";
import * as invitationChannels from "@/lib/invitation-channels";
import {
  InvitationSendError,
  channelsForGuest,
  createdAtMs,
  getInvitationSendView,
  sendInvitations,
  unreachableReason,
} from "@/lib/invitation-send";
import * as pairings from "@/lib/pairings";

function seedCompletedDraw(
  assignments: Array<ReturnType<typeof makeAssignment>>,
  people: Array<{
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    userId?: string | null;
    gender?: "female" | "male" | null;
  }> = [
    { id: 1, name: "Ada", phone: "351911111111", email: "ada@example.com" },
    { id: 2, name: "Bea", phone: "351922222222", email: "bea@example.com" },
  ],
  event: {
    occursOn?: string;
    withCases?: boolean;
    withTranslations?: boolean;
    withLocation?: boolean;
  } = {},
) {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({
      occursOn: event.occursOn ?? "2099-12-25",
      budgetKind: "unlimited",
      ...(event.withTranslations === false ? {} : eventNameTranslations()),
      ...(event.withLocation === false ? {} : eventLocation()),
    }),
  ]);
  mockDb.seed(
    schema.person,
    people.map((p) =>
      makePerson({
        id: p.id,
        name: p.name,
        phone: p.phone ?? null,
        email: p.email ?? null,
        userId: p.userId ?? null,
        gender: p.gender === undefined ? "female" : p.gender,
        ...(event.withCases === false ? {} : polishNameCases(p.name)),
      }),
    ),
  );
  mockDb.seed(
    schema.guest,
    people.map((p) => makeGuest({ id: p.id, personId: p.id })),
  );
  mockDb.seed(schema.draw, [
    makeDraw({ id: 1, status: "completed", executedAt: new Date() }),
  ]);
  mockDb.seed(schema.assignment, assignments);
}

function setPersonLanguage(id: number, language: string) {
  mockDb.sqlite
    .prepare("UPDATE person SET language = ? WHERE id = ?")
    .run(language, id);
}

describe("channelsForGuest", () => {
  const all = { whatsapp: true, signal: true, email: true };

  it("includes phone channels and email when both contacts exist", () => {
    expect(
      channelsForGuest({ phone: "351911111111" }, "ada@example.com", all),
    ).toEqual(["whatsapp", "signal", "email"]);
  });

  it("omits channels that are not configured", () => {
    expect(
      channelsForGuest(
        { phone: "351911111111" },
        "ada@example.com",
        { whatsapp: false, signal: false, email: true },
      ),
    ).toEqual(["email"]);
  });
});

describe("unreachableReason", () => {
  it("explains when nothing is configured", () => {
    expect(
      unreachableReason(
        { phone: "1" },
        "a@b.c",
        { whatsapp: false, signal: false, email: false },
      ),
    ).toBe("No delivery channels are configured");
  });

  it("explains missing phone", () => {
    expect(
      unreachableReason(
        { phone: null },
        "a@b.c",
        { whatsapp: true, signal: false, email: false },
      ),
    ).toBe("No phone number");
  });

  it("explains missing email and phone together", () => {
    expect(
      unreachableReason(
        { phone: null },
        null,
        { whatsapp: true, signal: false, email: true },
      ),
    ).toBe("No email or phone number");
  });

  it("falls back when the guest looks reachable", () => {
    expect(
      unreachableReason(
        { phone: "351911111111" },
        "ada@example.com",
        { whatsapp: true, signal: false, email: true },
      ),
    ).toBe("Cannot be reached");
  });
});

describe("getInvitationSendView", () => {
  beforeEach(() => {
    isWhatsAppConfigured.mockReturnValue(false);
    isSignalConfigured.mockReturnValue(false);
    isEmailConfigured.mockReturnValue(false);
  });

  it("disables both actions when there is no draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);

    const view = await getInvitationSendView(1);

    expect(view.drawn).toBe(false);
    expect(view.pending.disabledReason).toBe(NO_DRAW_REASON);
    expect(view.resend.disabledReason).toBe(NO_DRAW_REASON);
  });

  it("treats a completed draw with no assignments as drawn", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);

    const view = await getInvitationSendView(1);

    expect(view.drawn).toBe(true);
  });

  it("disables both actions when no channels are configured", async () => {
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, giverId: 2, receiverId: 1, revealToken: "token-2" }),
    ]);

    const view = await getInvitationSendView(1);

    expect(view.drawn).toBe(true);
    expect(view.pending.disabledReason).toBe(NO_CHANNELS_REASON);
    expect(view.resend.disabledReason).toBe(NO_CHANNELS_REASON);
  });

  it("disables resend when nobody has been invited yet", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);

    const view = await getInvitationSendView(1);

    expect(view.hasPriorSend).toBe(false);
    expect(view.pending.disabled).toBe(false);
    expect(view.resend.disabled).toBe(true);
    expect(view.resend.disabledReason).toBe(NO_PRIOR_SEND_REASON);
  });

  it("lists pending guests and greys the card once everyone was invited", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);

    const pending = await getInvitationSendView(1);
    expect(pending.hasPriorSend).toBe(true);
    expect(pending.pending.disabled).toBe(false);
    expect(pending.pending.recipients).toEqual([
      { assignmentId: 2, name: "Bea", channels: ["email"] },
    ]);
    expect(pending.resend.rounds).toEqual([
      {
        round: 1,
        guests: [{ assignmentId: 2, name: "Bea", channels: ["email"] }],
      },
      {
        round: 2,
        guests: [{ assignmentId: 1, name: "Ada", channels: ["email"] }],
      },
    ]);

    mockDb.reset();
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
        deliveredManual: true,
      }),
    ]);

    const done = await getInvitationSendView(1);
    expect(done.pending.disabled).toBe(true);
    expect(done.pending.disabledReason).toBe(ALL_RECEIVED_REASON);
    expect(done.pending.recipients).toEqual([]);
    expect(done.hasPriorSend).toBe(true);
    expect(done.resend.disabled).toBe(false);
  });

  it("greys pending when leftover guests cannot be reached", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          deliveredEmail: true,
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        { id: 1, name: "Ada", email: "ada@example.com" },
        { id: 2, name: "Bea", email: null, phone: null },
      ],
    );

    const view = await getInvitationSendView(1);

    expect(view.pending.disabled).toBe(true);
    expect(view.pending.disabledReason).toBe(REMAINING_UNREACHABLE_REASON);
    expect(view.pending.unreachable).toEqual([
      { assignmentId: 2, name: "Bea", reason: "No email address" },
    ]);
  });

  it("counts a successful batch as a prior round and manual as one round", async () => {
    isWhatsAppConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
        deliveredManual: true,
      }),
    ]);
    mockDb.seed(schema.invitationSend, [
      makeInvitationSend({
        id: 1,
        assignmentId: 1,
        batchId: "b1",
        channel: "whatsapp",
        status: "sent",
      }),
      makeInvitationSend({
        id: 2,
        assignmentId: 1,
        batchId: "b1",
        channel: "email",
        status: "failed",
        error: "boom",
      }),
    ]);

    const view = await getInvitationSendView(1);

    expect(view.history.length).toBeGreaterThanOrEqual(1);

    expect(view.resend.rounds).toEqual([
      {
        round: 2,
        guests: [
          { assignmentId: 1, name: "Ada", channels: ["whatsapp"] },
          { assignmentId: 2, name: "Bea", channels: ["whatsapp"] },
        ],
      },
    ]);
    expect(view.history).toHaveLength(1);
    expect(view.history[0]?.source).toBe("draw");
    expect(view.history[0]?.rows).toEqual([
      {
        assignmentId: 1,
        name: "Ada",
        channel: "whatsapp",
        status: "sent",
        error: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        assignmentId: 1,
        name: "Ada",
        channel: "email",
        status: "failed",
        error: "boom",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("sorts history batches newest first and skips unknown givers", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2, deliveredEmail: true }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 9,
        giverId: 99,
        receiverId: 99,
        revealToken: "token-x",
      }),
    ]);
    mockDb.seed(schema.invitationSend, [
      makeInvitationSend({
        id: 1,
        assignmentId: 1,
        batchId: "older",
        channel: "email",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      makeInvitationSend({
        id: 2,
        assignmentId: 2,
        batchId: "newer",
        channel: "email",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
      makeInvitationSend({
        id: 3,
        assignmentId: 1,
        batchId: "newer",
        channel: "email",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
      makeInvitationSend({
        id: 4,
        assignmentId: 9,
        batchId: "newer",
        channel: "email",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ]);

    const view = await getInvitationSendView(1);
    expect(view.history.map((b) => b.batchId)).toEqual(["newer", "older"]);
    expect(view.history[0]?.rows.map((r) => r.name).sort()).toEqual([
      "#9",
      "Ada",
      "Bea",
    ]);
  });

  it("omits already-delivered unreachable guests from pending", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          deliveredEmail: true,
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
          deliveredEmail: true,
        }),
      ],
      [
        { id: 1, name: "Ada", phone: null, email: null },
        { id: 2, name: "Bea", phone: null, email: null },
      ],
    );

    const view = await getInvitationSendView(1);
    expect(view.pending.unreachable).toEqual([]);
    expect(view.resend.unreachable.map((row) => row.name).sort()).toEqual([
      "Ada",
      "Bea",
    ]);
  });

  it("disables resend when nobody is reachable", async () => {
    isWhatsAppConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        { id: 1, name: "Ada", phone: null, email: null },
        { id: 2, name: "Bea", phone: null, email: null },
      ],
    );

    const view = await getInvitationSendView(1);

    expect(view.resend.disabled).toBe(true);
    expect(view.resend.disabledReason).toBe(NONE_REACHABLE_REASON);
  });

  it("disables send and resend when the event date has passed", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      undefined,
      { occursOn: "2000-01-01" },
    );

    const view = await getInvitationSendView(1);

    expect(view.eventPast).toBe(true);
    expect(view.pending.disabled).toBe(true);
    expect(view.pending.disabledReason).toBe(EVENT_PAST_REASON);
    expect(view.resend.disabled).toBe(true);
    expect(view.resend.disabledReason).toBe(EVENT_PAST_REASON);
    expect(view.pending.recipients).toHaveLength(2);
  });

  it("uses a linked login email when the person has none", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        { id: 1, name: "Ada", email: null, userId: "user_ada" },
        { id: 2, name: "Bea", email: "bea@example.com" },
      ],
    );
    mockDb.seed(schema.user, [makeUser({ id: "user_ada", email: "ada@login.com" })]);

    const view = await getInvitationSendView(1);

    expect(view.pending.recipients.find((r) => r.name === "Ada")?.channels).toEqual(
      ["email"],
    );
  });

  it("sorts a missing giver as a blank name", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({
          id: 1,
          giverId: 99,
          receiverId: 1,
          revealToken: "token-1",
        }),
        makeAssignment({
          id: 2,
          giverId: 1,
          receiverId: 99,
          revealToken: "token-2",
        }),
      ],
      [{ id: 1, name: "Ada", email: "ada@example.com" }],
    );

    const view = await getInvitationSendView(1);
    expect(view.pending.recipients).toEqual([
      { assignmentId: 2, name: "Ada", channels: ["email"] },
    ]);
  });

  it("loads assignments from the draw when the current view omits them", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    vi.spyOn(pairings, "currentDrawWithAssignments").mockResolvedValue({
      draw: makeDraw({ id: 1, status: "completed", executedAt: new Date() }),
      assignments: undefined as never,
    });

    const view = await getInvitationSendView(1);
    expect(view.pending.recipients.map((r) => r.name).sort()).toEqual([
      "Ada",
      "Bea",
    ]);
  });
});

describe("sendInvitations", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://santa.test");
    isWhatsAppConfigured.mockReturnValue(false);
    isSignalConfigured.mockReturnValue(false);
    isEmailConfigured.mockReturnValue(false);
    sendBatch.mockClear();
    sendSignalBatch.mockClear();
    sendEmailBatch.mockClear();
    sendEmailBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
    );
  });

  it("falls back when a disabled send has no reason", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    vi.spyOn(invitationChannels, "invitationActionState").mockReturnValue({
      pending: { disabled: true, disabledReason: null },
      resend: { disabled: true, disabledReason: null },
    });
    await expect(sendInvitations(1, "pending")).rejects.toThrow(
      "Nothing to send.",
    );
    await expect(sendInvitations(1, "resend")).rejects.toThrow(
      "Nothing to send.",
    );
  });

  it("refuses to send before a completed draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);

    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      name: "InvitationSendError",
      message: NO_DRAW_REASON,
    });
  });

  it("refuses to send while a seated guest is missing a Polish case", async () => {
    isEmailConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the following guests have at least one missing Polish conjugation: Anna, Bartek.";
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        { id: 1, name: "Bartek", phone: "351911111111", email: "bartek@example.com" },
        { id: 2, name: "Anna", phone: "351922222222", email: "anna@example.com" },
      ],
      { withCases: false },
    );

    const view = await getInvitationSendView(1);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: reason,
    });
    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      message: reason,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("refuses to send while a seated guest has no gender", async () => {
    isEmailConfigured.mockReturnValue(true);
    isSignalConfigured.mockReturnValue(true);
    isWhatsAppConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the following guests have no gender: Bea.";
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        {
          id: 1,
          name: "Ada",
          phone: "351911111111",
          email: "ada@example.com",
          gender: "female",
        },
        {
          id: 2,
          name: "Bea",
          phone: "351922222222",
          email: "bea@example.com",
          gender: null,
        },
      ],
    );

    const view = await getInvitationSendView(1);
    expect(view.missingGenderReason).toBe(reason);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: reason,
    });
    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      message: reason,
    });
    const selections = [
      { whatsapp: true, signal: true, email: true },
      { whatsapp: true, signal: false, email: false },
      { whatsapp: false, signal: true, email: false },
      { whatsapp: false, signal: false, email: true },
      { whatsapp: true, signal: true, email: false },
      { whatsapp: true, signal: false, email: true },
      { whatsapp: false, signal: true, email: true },
    ];
    for (const selected of selections) {
      await expect(
        sendInvitations(1, "pending", selected),
      ).rejects.toMatchObject({ message: reason });
    }
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("names every guest without a gender and stays blocked for a channel subset", async () => {
    isEmailConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the following guests have no gender: Ada, Bea.";
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        {
          id: 1,
          name: "Bea",
          phone: "351911111111",
          email: "bea@example.com",
          gender: null,
        },
        {
          id: 2,
          name: "Ada",
          phone: "351922222222",
          email: "ada@example.com",
          gender: null,
        },
      ],
    );

    const view = await getInvitationSendView(1);
    expect(view.missingGenderReason).toBe(reason);
    const selected = invitationChannels.applyChannelSelection(view, {
      whatsapp: false,
      signal: false,
      email: true,
    });
    expect(selected.pending.disabledReason).toBe(reason);
    expect(selected.resend.disabledReason).toBe(reason);
    await expect(
      sendInvitations(1, "pending", {
        whatsapp: false,
        signal: false,
        email: true,
      }),
    ).rejects.toMatchObject({ message: reason });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("refuses to send while the event is missing a translation", async () => {
    isEmailConfigured.mockReturnValue(true);
    isSignalConfigured.mockReturnValue(true);
    isWhatsAppConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the event is missing name translations: Polish, German, Spanish, Japanese.";
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      undefined,
      { withTranslations: false },
    );

    const view = await getInvitationSendView(1);
    expect(view.missingEventTranslationsReason).toBe(reason);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: reason,
    });
    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      message: reason,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("refuses to send while the event has no location", async () => {
    isEmailConfigured.mockReturnValue(true);
    isSignalConfigured.mockReturnValue(true);
    isWhatsAppConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the event is missing its location: place name, Polish phrase (gdzie?).";
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      undefined,
      { withLocation: false },
    );

    const view = await getInvitationSendView(1);
    expect(view.missingEventLocationReason).toBe(reason);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: reason,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("refuses to send while the event has a place but no Polish gdzie? phrase", async () => {
    isEmailConfigured.mockReturnValue(true);
    isSignalConfigured.mockReturnValue(true);
    isWhatsAppConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the event is missing its location: Polish phrase (gdzie?).";
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare("UPDATE event SET location_gdzie = ? WHERE id = 1")
      .run("  ");

    const view = await getInvitationSendView(1);
    expect(view.missingEventLocationReason).toBe(reason);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: reason,
    });
    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      message: reason,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("refuses email and Signal when a reachable guest has no template pack", async () => {
    isEmailConfigured.mockReturnValue(true);
    isSignalConfigured.mockReturnValue(true);
    isWhatsAppConfigured.mockReturnValue(true);
    const emailReason =
      "Cannot send email invitations because the following guests have no email templates in their language: Ada (xx).";
    const signalReason =
      "Cannot send Signal invitations because the following guests have no Signal templates in their language: Ada (xx).";
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    setPersonLanguage(1, "xx");

    const view = await getInvitationSendView(1);
    expect(view.missingEmailTemplateReason).toBe(emailReason);
    expect(view.missingSignalTemplateReason).toBe(signalReason);
    expect(view.pending.disabledReason).toBe(emailReason);
    expect(view.resend.disabledReason).toBe(emailReason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: emailReason,
    });
    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      message: emailReason,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendBatch).not.toHaveBeenCalled();

    const whatsappOnly = { whatsapp: true, signal: false, email: false };
    expect(
      invitationChannels.applyChannelSelection(view, whatsappOnly).pending
        .disabled,
    ).toBe(false);
    const result = await sendInvitations(1, "pending", whatsappOnly);
    expect(result.delivery.whatsapp?.sent).toBe(2);
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendBatch).toHaveBeenCalled();
  });

  it("ignores a missing template language when that channel has no address", async () => {
    isWhatsAppConfigured.mockReturnValue(true);
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      [
        { id: 1, name: "Ada", phone: "351911111111", email: null },
        { id: 2, name: "Bea", phone: "351922222222", email: null },
      ],
    );
    setPersonLanguage(1, "xx");
    setPersonLanguage(2, "xx");

    const view = await getInvitationSendView(1);
    expect(view.missingEmailTemplateReason).toBeNull();
    expect(view.missingSignalTemplateReason).toBeNull();
    expect(view.pending.disabled).toBe(false);
  });

  it("names only the guest missing one case and still blocks a channel selection", async () => {
    isEmailConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because the following guests have at least one missing Polish conjugation: Bea.";
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare("UPDATE person SET name_wolacz = NULL WHERE id = ?")
      .run(2);

    const view = await getInvitationSendView(1);
    expect(view.missingConjugationReason).toBe(reason);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(
      sendInvitations(1, "pending", {
        whatsapp: false,
        signal: false,
        email: true,
      }),
    ).rejects.toMatchObject({ message: reason });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("sends only to guests who have not received an invitation", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);

    const result = await sendInvitations(1, "pending");

    expect(result.delivery.email).toEqual({ sent: 1, failed: 0 });
    expect(sendEmailBatch).toHaveBeenCalledTimes(1);
    expect(sendEmailBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        to: "bea@example.com",
        revealToken: "token-2",
      }),
    ]);
    const logs = mockDb.rows(schema.invitationSend);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      assignmentId: 2,
      source: "pending",
      channel: "email",
      status: "sent",
    });
    expect(
      mockDb.rows(schema.assignment).find((r) => r.id === 2)?.deliveredEmail,
    ).toBe(true);
  });

  it("refuses to resend when nobody has been invited yet", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);

    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      name: "InvitationSendError",
      message: NO_PRIOR_SEND_REASON,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("resends to every reachable guest and tags the log as resend", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
        deliveredEmail: true,
      }),
    ]);

    await sendInvitations(1, "resend");

    expect(sendEmailBatch.mock.calls[0][0].map((m) => m.to).sort()).toEqual([
      "ada@example.com",
      "bea@example.com",
    ]);
    expect(
      mockDb.rows(schema.invitationSend).every((r) => r.source === "resend"),
    ).toBe(true);
  });

  it("refuses to send or resend after the event date", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw(
      [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          deliveredEmail: true,
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "token-2",
        }),
      ],
      undefined,
      { occursOn: "2000-01-01" },
    );

    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      name: "InvitationSendError",
      message: EVENT_PAST_REASON,
    });
    await expect(
      sendInvitations(1, "resend", {
        whatsapp: false,
        signal: false,
        email: true,
      }),
    ).rejects.toMatchObject({
      name: "InvitationSendError",
      message: EVENT_PAST_REASON,
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("refuses to send when the party date is missing or invalid", async () => {
    for (const occursOn of ["", "2026-13-01"]) {
      mockDb.reset();
      isEmailConfigured.mockReturnValue(true);
      isSignalConfigured.mockReturnValue(true);
      isWhatsAppConfigured.mockReturnValue(true);
      seedCompletedDraw(
        [
          makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
          makeAssignment({
            id: 2,
            giverId: 2,
            receiverId: 1,
            revealToken: "token-2",
          }),
        ],
        undefined,
        { occursOn },
      );

      const view = await getInvitationSendView(1);
      expect(view.missingDateReason).toBe(MISSING_EVENT_DATE_SEND_REASON);
      expect(view.eventPast).toBe(false);
      expect(view.pending.disabled).toBe(true);
      expect(view.pending.disabledReason).toBe(MISSING_EVENT_DATE_SEND_REASON);
      expect(view.resend.disabled).toBe(true);
      expect(view.resend.disabledReason).toBe(MISSING_EVENT_DATE_SEND_REASON);
      await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
        name: "InvitationSendError",
        message: MISSING_EVENT_DATE_SEND_REASON,
      });
      await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
        name: "InvitationSendError",
        message: MISSING_EVENT_DATE_SEND_REASON,
      });
      expect(sendEmailBatch).not.toHaveBeenCalled();
      expect(sendSignalBatch).not.toHaveBeenCalled();
      expect(sendBatch).not.toHaveBeenCalled();
      sendBatch.mockClear();
      sendSignalBatch.mockClear();
      sendEmailBatch.mockClear();
    }
  });

  it("throws when pending has nobody left to invite", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({
        id: 1,
        giverId: 1,
        receiverId: 2,
        deliveredEmail: true,
      }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
        deliveredManual: true,
      }),
    ]);

    await expect(sendInvitations(1, "pending")).rejects.toBeInstanceOf(
      InvitationSendError,
    );
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: ALL_RECEIVED_REASON,
    });
  });

  it("maps Date, epoch, and invalid timestamps", () => {
    expect(createdAtMs(new Date("2026-02-01T00:00:00.000Z"))).toBe(
      Date.parse("2026-02-01T00:00:00.000Z"),
    );
    expect(createdAtMs(1_735_689_600)).toBe(1_735_689_600_000);
    expect(createdAtMs(1_735_689_600_000)).toBe(1_735_689_600_000);
    expect(createdAtMs("2026-02-01T00:00:00.000Z")).toBe(
      Date.parse("2026-02-01T00:00:00.000Z"),
    );
    expect(createdAtMs("not-a-date")).toBe(0);
  });

  it("throws Nothing to send when a selection leaves no recipients", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    vi.spyOn(invitationChannels, "applyChannelSelection").mockReturnValue({
      drawn: true,
      eventPast: false,
      missingDateReason: null,
      missingGenderReason: null,
      missingConjugationReason: null,
      missingEventTranslationsReason: null,
      missingEventLocationReason: null,
      invalidTemplatesReason: null,
      missingBudgetReason: null,
      missingBudgetSentenceReason: null,
      missingEmailTemplateReason: null,
      missingSignalTemplateReason: null,
      channels: { whatsapp: false, signal: false, email: true },
      hasPriorSend: true,
      pending: {
        disabled: false,
        disabledReason: null,
        recipients: [],
        unreachable: [],
      },
      resend: {
        disabled: false,
        disabledReason: null,
        rounds: [],
        unreachable: [],
      },
      history: [],
    });
    await expect(
      sendInvitations(1, "pending", {
        whatsapp: false,
        signal: false,
        email: true,
      }),
    ).rejects.toMatchObject({ message: "Nothing to send." });
  });

  it("sends only on the selected channels and stores them on the draw", async () => {
    isEmailConfigured.mockReturnValue(true);
    isSignalConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);

    const result = await sendInvitations(1, "pending", {
      whatsapp: false,
      signal: false,
      email: true,
    });

    expect(result.delivery.email).toEqual({ sent: 2, failed: 0 });
    expect(result.delivery.signal).toBeNull();
    expect(sendEmailBatch).toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      deliverWhatsapp: false,
      deliverSignal: false,
      deliverEmail: true,
    });
  });

  it("refuses to send while the budget choice is unset", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite.prepare("UPDATE event SET budget_kind = NULL").run();

    const view = await getInvitationSendView(1);
    expect(view.missingBudgetReason).toBe(
      "Choose a budget, make-the-gift, or no spending limit.",
    );
    expect(view.pending.disabledReason).toBe(view.missingBudgetReason);
    await expect(sendInvitations(1, "pending")).rejects.toThrow(
      "Choose a budget, make-the-gift, or no spending limit.",
    );
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(mockDb.rows(schema.draw)[0]?.budgetKind).toBeNull();
  });

  it("stamps an unset draw from the edition on the first send", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare(
        `UPDATE event
         SET budget_kind = 'amount', budget = 20, currency = 'EUR',
             budget_eur = 20, budget_pln = 80, budget_jpy = 3000`,
      )
      .run();
    mockDb.sqlite
      .prepare("UPDATE draw SET budget_kind = NULL, budget = NULL")
      .run();

    await sendInvitations(1, "pending");

    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      budgetKind: "amount",
      budget: 20,
      budgetEur: 20,
    });
    expect(sendEmailBatch.mock.calls[0][0][0].text).toContain(
      "This year's spending limit is €20",
    );

    mockDb.sqlite
      .prepare("UPDATE event SET budget = 99, budget_eur = 99")
      .run();
    sendEmailBatch.mockClear();
    await sendInvitations(1, "resend");
    expect(sendEmailBatch.mock.calls[0][0][0].text).toContain(
      "This year's spending limit is €20",
    );
    expect(sendEmailBatch.mock.calls[0][0][0].text).not.toContain(
      "€99",
    );
    expect(mockDb.rows(schema.draw)[0]?.budget).toBe(20);
  });

  it("stamps make-the-gift onto an unset draw and keeps an unknown currency", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare(
        "UPDATE event SET budget_kind = 'zero', budget = NULL, currency = 'XXX'",
      )
      .run();
    mockDb.sqlite
      .prepare("UPDATE draw SET budget_kind = NULL, budget = NULL")
      .run();

    await sendInvitations(1, "pending");

    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      budgetKind: "zero",
      budget: null,
      currency: "XXX",
      budgetEur: null,
    });
    expect(sendEmailBatch.mock.calls[0][0][0].text).toContain(
      "This year, everyone is preparing a handmade gift without spending money.",
    );
  });

  it("stamps an amount choice that has no stored number or extras", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare(
        `UPDATE event
         SET budget_kind = 'amount', budget = NULL, currency = 'EUR',
             budget_eur = NULL, budget_pln = NULL, budget_jpy = NULL`,
      )
      .run();
    mockDb.sqlite
      .prepare("UPDATE draw SET budget_kind = NULL, budget = NULL")
      .run();

    await sendInvitations(1, "pending");

    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      budgetKind: "amount",
      budget: null,
      budgetEur: null,
      budgetPln: null,
      budgetJpy: null,
    });
  });

  it("does not stamp a draw when the edition row is gone", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare("UPDATE draw SET budget_kind = 'unlimited'")
      .run();
    vi.spyOn(eventsLib, "getEventById").mockResolvedValue(undefined);

    await expect(sendInvitations(1, "pending")).rejects.toThrow(
      /no valid party date/,
    );
    expect(mockDb.rows(schema.draw)[0]?.budgetKind).toBe("unlimited");
    vi.restoreAllMocks();
  });

  it("refuses to send when the active budget sentence is blank", async () => {
    isEmailConfigured.mockReturnValue(true);
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.sqlite
      .prepare("UPDATE event SET budget_kind = 'zero'")
      .run();
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "email.budget_zero",
        language: "en",
        value: " ",
      }),
    ]);

    const view = await getInvitationSendView(1);
    expect(view.missingBudgetSentenceReason).toMatch(/email Make-the-gift line/);
    expect(view.pending.disabled).toBe(true);
    await expect(sendInvitations(1, "pending")).rejects.toThrow(
      /email Make-the-gift line/,
    );
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("refuses to send while an edition template does not parse", async () => {
    isWhatsAppConfigured.mockReturnValue(true);
    const reason =
      "Cannot send invitations because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.";
    seedCompletedDraw([
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "reveal.wishlist_empty",
        language: "pl",
        value:
          "{receiver} nie {receiver_gender|female:wpisała|male:wpisał|wpisał(a)} jeszcze żadnych pomysłów na prezent. Zajrzyj tu później.",
      }),
    ]);

    const view = await getInvitationSendView(1);
    expect(view.invalidTemplatesReason).toBe(reason);
    expect(view.pending.disabledReason).toBe(reason);
    expect(view.resend.disabledReason).toBe(reason);
    await expect(sendInvitations(1, "pending")).rejects.toMatchObject({
      message: reason,
    });
    await expect(sendInvitations(1, "resend")).rejects.toMatchObject({
      message: reason,
    });
    expect(sendBatch).not.toHaveBeenCalled();
  });
});
