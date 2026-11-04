import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestView } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  eventLocation,
  makeAssignment,
  makeDraw,
  makeEvent,
  makeEventTemplate,
  makeGuestView,
  makeSeries,
} from "@/test/helpers/fixtures";

const {
  isWhatsAppConfigured,
  sendBatch,
  isSignalConfigured,
  sendSignalBatch,
  isEmailConfigured,
  sendEmailBatch,
} = vi.hoisted(() => ({
  isWhatsAppConfigured: vi.fn(async () => true),
  sendBatch: vi.fn(async (inputs: Array<{ to: string }>) =>
    inputs.map((i) => ({ to: i.to, ok: true })),
  ),
  isSignalConfigured: vi.fn(() => false),
  sendSignalBatch: vi.fn(
    async (inputs: Array<{ to: string; text?: string; secondParam?: string }>) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
  ),
  isEmailConfigured: vi.fn(async () => true),
  sendEmailBatch: vi.fn(
    async (
      inputs: Array<{
        to: string;
        text: string;
        subject: string;
        html?: string;
      }>,
    ) =>
      inputs.map((i) => ({ to: i.to, ok: true })) as Array<{
        to: string;
        ok: boolean;
        error?: string;
      }>,
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

import { CHANNELS, deliverAssignments } from "@/lib/delivery";
import { budgetCopy, budgetCopyForGuests } from "@/lib/delivery/channels";
import { TEMPLATE_DEFAULTS } from "@/lib/templates/fields";
import * as events from "@/lib/events";
import { emptyEventNameFields } from "@/lib/event-name";
import { emptyTemplatesView } from "@/lib/templates";

describe("deliverAssignments", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://santa.test");
    isWhatsAppConfigured.mockReset();
    isWhatsAppConfigured.mockResolvedValue(true);
    isSignalConfigured.mockReset();
    isSignalConfigured.mockReturnValue(false);
    isEmailConfigured.mockReset();
    isEmailConfigured.mockResolvedValue(true);
    sendBatch.mockReset();
    sendBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
    );
    sendEmailBatch.mockReset();
    sendEmailBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
    );
    sendSignalBatch.mockReset();
    sendSignalBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
    );
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw()]);
  });

  it("returns empty summaries when there are no assignments", async () => {
    await expect(
      deliverAssignments({
        draw: makeDraw(),
        assignments: [],
        guests: [makeGuestView({ id: 1, name: "Ada", phone: "351911111111" })],
        channels: { whatsapp: true, signal: false, email: false },
        source: "pending",
      }),
    ).resolves.toEqual({
      whatsapp: null,
      signal: null,
      email: null,
    });
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("does not update assignments when a channel write has no giver ids", async () => {
    const email = CHANNELS.find((channel) => channel.id === "email")!;
    vi.spyOn(email, "patches").mockReturnValue([
      { giverIds: [], set: { deliveredEmail: true } },
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);
    await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 1, giverId: 1, revealToken: "tokada000001" }],
      guests: [
        makeGuestView({
          id: 1,
          name: "Ada",
          email: "ada@example.com",
        }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(mockDb.rows(schema.assignment)[0]?.deliveredEmail).toBe(false);
  });

  it("treats a missing phone-channel summary as zeroes", async () => {
    const whatsapp = CHANNELS.find((channel) => channel.id === "whatsapp")!;
    const previous = whatsapp.needs;
    (whatsapp as { needs: "phone" | "email" }).needs = "email";
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);
    try {
      const result = await deliverAssignments({
        draw: makeDraw(),
        assignments: [{ id: 1, giverId: 1, revealToken: "tokada000001" }],
        guests: [makeGuestView({ id: 1, name: "Ada", phone: null })],
        channels: { whatsapp: true, signal: false, email: false },
        source: "pending",
      });
      expect(result.whatsapp).toEqual({ sent: 0, failed: 0, errors: [] });
    } finally {
      (whatsapp as { needs: "phone" | "email" }).needs = previous;
    }
  });

  it("uses a blank date when the edition row is missing", async () => {
    vi.spyOn(events, "getEventById").mockResolvedValue(undefined);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 1, giverId: 1, revealToken: "tokada000001" }],
      guests: [
        makeGuestView({ id: 1, name: "Ada", email: "ada@example.com" }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toEqual({ sent: 1, failed: 0 });
    expect(sendEmailBatch.mock.calls[0][0][0].text).toContain("Ada");
  });

  it("renders this edition's templates when they differ from the JSON defaults", async () => {
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "email.subject",
        language: "en",
        value: "Edition draw {event}",
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);
    await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 1, giverId: 1, revealToken: "tokada000001" }],
      guests: [
        makeGuestView({
          id: 1,
          name: "Ada",
          language: "en",
          email: "ada@example.com",
        }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch.mock.calls[0][0][0].subject).toBe("Edition draw Xmas");
  });

  it("renders a blank Signal url when the outbound message omits one", async () => {
    const signal = CHANNELS.find((channel) => channel.id === "signal")!;
    await signal.send(
      [
        {
          assignment: { id: 1, giverId: 1, revealToken: "tok" },
          guest: makeGuestView({ id: 1, name: "Ada", language: "en" }),
          to: "351911111111",
          url: undefined as never,
        },
      ],
      {
        templates: emptyTemplatesView(),
        event: emptyEventNameFields("Office"),
        occursOn: "2026-01-01",
        location: { location: null, locationGdzie: null },
        amounts: { budget: null, currency: "EUR" },
        guestCount: 2,
      },
    );
    expect(sendSignalBatch.mock.calls[0][0][0].secondParam).toBeUndefined();
    expect(sendSignalBatch.mock.calls[0][0][0].text).toContain(
      "Open the link below",
    );
  });

  it("skips a missing giver and maps a send without an error string", async () => {
    sendBatch.mockResolvedValue([{ to: "351922222222", ok: false }]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [
        { id: 1, giverId: 99, revealToken: "missing" },
        { id: 2, giverId: 2, revealToken: "token-2" },
      ],
      guests: [
        makeGuestView({
          id: 2,
          personId: 2,
          name: "Bea",
          phone: "351922222222",
        }),
      ],
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(result.whatsapp).toEqual({
      sent: 0,
      failed: 1,
      errors: ["351922222222: send failed"],
    });
  });

  it("names an unknown recipient when a send result is missing", async () => {
    sendBatch.mockResolvedValue([]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 2, giverId: 2, revealToken: "token-2" }],
      guests: [
        makeGuestView({
          id: 2,
          personId: 2,
          name: "Bea",
          phone: "351922222222",
        }),
      ],
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(result.whatsapp).toEqual({
      sent: 0,
      failed: 1,
      errors: ["unknown: send failed"],
    });
  });

  it("omits a blank email error from the summary list", async () => {
    sendEmailBatch.mockResolvedValue([
      { to: "bea@example.com", ok: false, error: "" },
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 2, giverId: 2, revealToken: "token-2" }],
      guests: [
        makeGuestView({
          id: 2,
          personId: 2,
          name: "Bea",
          email: "bea@example.com",
        }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toEqual({ sent: 0, failed: 1 });
  });

  it("uses the SMTP fallback when email fails without a reason", async () => {
    sendEmailBatch.mockResolvedValue([{ to: "bea@example.com", ok: false }]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 2, giverId: 2, revealToken: "token-2" }],
      guests: [
        makeGuestView({
          id: 2,
          personId: 2,
          name: "Bea",
          email: "bea@example.com",
        }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toEqual({ sent: 0, failed: 1 });
  });

  it("leaves email summary null when nobody has an address", async () => {
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 1, giverId: 1, revealToken: "token-1" }],
      guests: [makeGuestView({ id: 1, name: "Ada", email: null, phone: null })],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toBeNull();
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("does not render English when the guest language has no template pack", async () => {
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [{ id: 1, giverId: 1, revealToken: "tokada000001" }],
      guests: [
        makeGuestView({
          id: 1,
          name: "Ada",
          email: "ada@example.com",
          language: "xx" as GuestView["language"],
        }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(result.email).toEqual({ sent: 0, failed: 1 });
    expect(mockDb.rows(schema.invitationSend)).toEqual([
      expect.objectContaining({
        assignmentId: 1,
        channel: "email",
        status: "failed",
        error: expect.stringContaining("Ada (xx)"),
      }),
    ]);
  });

  it("sends the other guests when one language has no template pack", async () => {
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({
        id: 2,
        giverId: 2,
        receiverId: 1,
        revealToken: "token-2",
      }),
    ]);
    const result = await deliverAssignments({
      draw: makeDraw(),
      assignments: [
        { id: 1, giverId: 1, revealToken: "tokada000001" },
        { id: 2, giverId: 2, revealToken: "tokbea000002" },
      ],
      guests: [
        makeGuestView({
          id: 1,
          name: "Ada",
          email: "ada@example.com",
          language: "xx" as GuestView["language"],
        }),
        makeGuestView({
          id: 2,
          personId: 2,
          name: "Bea",
          email: "bea@example.com",
          language: "en",
        }),
      ],
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toEqual({ sent: 1, failed: 1 });
    const batch = sendEmailBatch.mock.calls[0][0];
    expect(batch).toHaveLength(1);
    expect(batch[0].to).toBe("bea@example.com");
    expect(batch[0].text).not.toContain("Ada");
  });

  const ADA = makeGuestView({
    id: 1,
    name: "Ada",
    phone: "351911111111",
    email: "ada@example.com",
  });
  const BEA = makeGuestView({
    id: 2,
    name: "Bea",
    phone: "351922222222",
    email: "bea@example.com",
  });

  function seedPair(
    guests: ReturnType<typeof makeGuestView>[] = [ADA, BEA],
    draw = makeDraw(),
  ) {
    const assignments = [
      makeAssignment({
        id: 1,
        drawId: draw.id,
        giverId: guests[0].id,
        receiverId: guests[1].id,
        revealToken: "tokada000001",
      }),
      makeAssignment({
        id: 2,
        drawId: draw.id,
        giverId: guests[1].id,
        receiverId: guests[0].id,
        revealToken: "tokbea000001",
      }),
    ];
    mockDb.seed(schema.assignment, assignments);
    return {
      draw,
      assignments: assignments.map((row) => ({
        id: row.id,
        giverId: row.giverId,
        revealToken: row.revealToken,
      })),
      guests,
    };
  }

  function deliveredOf(giverId: number) {
    const row = mockDb
      .rows(schema.assignment)
      .find((r) => r.giverId === giverId);
    return {
      whatsapp: row?.deliveredWhatsapp,
      signal: row?.deliveredSignal,
      email: row?.deliveredEmail,
      emailFailed: row?.emailFailed,
    };
  }

  it("skips WhatsApp when the channel is off", async () => {
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: false },
      source: "pending",
    });
    expect(sendBatch).not.toHaveBeenCalled();
    expect(result.whatsapp).toBeNull();
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
  });

  it("skips WhatsApp when the channel is on but unconfigured", async () => {
    isWhatsAppConfigured.mockResolvedValue(false);
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(sendBatch).not.toHaveBeenCalled();
    expect(result.whatsapp).toBeNull();
  });

  it("counts a missing phone as failed and records an error string", async () => {
    const seeded = seedPair([ADA, { ...BEA, phone: null }]);
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        to: ADA.phone,
        giverName: "Ada",
        secondParam: "https://santa.test/tokada000001",
      }),
    ]);
    expect(result.whatsapp).toEqual({
      sent: 1,
      failed: 1,
      errors: ["Bea has no phone number"],
    });
    expect(deliveredOf(1)).toMatchObject({ whatsapp: true });
    expect(deliveredOf(2)).toMatchObject({ whatsapp: false });
  });

  it("sends the private guest URL as the WhatsApp second template param", async () => {
    const seeded = seedPair();
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(sendBatch.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: ADA.phone,
          giverName: "Ada",
          secondParam: "https://santa.test/tokada000001",
        }),
        expect.objectContaining({
          to: BEA.phone,
          giverName: "Bea",
          secondParam: "https://santa.test/tokbea000001",
        }),
      ]),
    );
  });

  it("skips Signal when the channel is off", async () => {
    isSignalConfigured.mockReturnValue(true);
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: false },
      source: "pending",
    });
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(result.signal).toBeNull();
  });

  it("skips Signal when the channel is on but unconfigured", async () => {
    isSignalConfigured.mockReturnValue(false);
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: true, email: false },
      source: "pending",
    });
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(result.signal).toBeNull();
  });

  it("counts a missing phone as failed for Signal and records an error string", async () => {
    isSignalConfigured.mockReturnValue(true);
    const seeded = seedPair([ADA, { ...BEA, phone: null }]);
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: true, email: false },
      source: "pending",
    });
    expect(sendSignalBatch).toHaveBeenCalledTimes(1);
    expect(sendSignalBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        to: ADA.phone,
        giverName: "Ada",
        secondParam: "https://santa.test/tokada000001",
        text: expect.stringContaining("Open the link below"),
      }),
    ]);
    expect(result.signal).toEqual({
      sent: 1,
      failed: 1,
      errors: ["Bea has no phone number"],
    });
    expect(deliveredOf(1)).toMatchObject({ signal: true });
    expect(deliveredOf(2)).toMatchObject({ signal: false });
  });

  it("skips email when the channel is off", async () => {
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: false },
      source: "pending",
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(result.email).toBeNull();
  });

  it("skips email when the channel is on but unconfigured", async () => {
    isEmailConfigured.mockResolvedValue(false);
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(result.email).toBeNull();
  });

  it("emails using the person address", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 1, name: "Office" })]);
    const seeded = seedPair([ADA, BEA], makeDraw({ id: 1, name: "Office" }));
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch.mock.calls[0][0].map((m) => m.to).sort()).toEqual([
      "ada@example.com",
      "bea@example.com",
    ]);
  });

  it("includes a budget line in the email only when budget is not null", async () => {
    mockDb.seed(schema.event, [makeEvent({ name: "Office" })]);
    const withBudget = makeDraw({ id: 1, name: "Office", budget: 25 });
    mockDb.seed(schema.draw, [withBudget]);
    const seeded = seedPair([ADA, BEA], withBudget);
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    const budgeted = sendEmailBatch.mock.calls[0][0];
    expect(budgeted).toHaveLength(2);
    for (const mail of budgeted) {
      expect(mail.text).toContain("This year's spending limit is €25");
      expect(mail.subject).toBe(
        "🎁 Office: Find out who you're preparing a present for!",
      );
    }
    expect(budgeted.find((m) => m.to === "ada@example.com")?.text).toContain(
      "https://santa.test/tokada000001",
    );
    expect(budgeted.find((m) => m.to === "ada@example.com")?.html).toContain(
      "https://santa.test/tokada000001",
    );

    sendEmailBatch.mockClear();
    mockDb.reset();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ name: "Office" })]);
    const withoutBudget = makeDraw({ id: 2, name: "Office", budget: null });
    mockDb.seed(schema.draw, [withoutBudget]);
    const unbudgetedSeed = seedPair([ADA, BEA], withoutBudget);
    await deliverAssignments({
      ...unbudgetedSeed,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    const unbudgeted = sendEmailBatch.mock.calls[0][0];
    for (const mail of unbudgeted) {
      expect(mail.text).not.toContain("This year's spending limit");
    }
  });

  it("omits a money sentence when a numeric zero was not chosen as make-the-gift", async () => {
    const draw = makeDraw({ budget: 0, name: "Office" });
    mockDb.seed(schema.draw, [draw]);
    const seeded = seedPair([ADA, BEA], draw);
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch.mock.calls[0][0][0].text).not.toContain("€0.00");
    expect(sendEmailBatch.mock.calls[0][0][0].text).not.toContain(
      "handmade gift",
    );
  });

  it("uses the make-the-gift and no-limit sentences", async () => {
    const handmade = makeDraw({
      budgetKind: "zero",
      budget: null,
      name: "Office",
    });
    mockDb.seed(schema.draw, [handmade]);
    isSignalConfigured.mockReturnValue(true);
    const seeded = seedPair([ADA, BEA], handmade);
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: true, email: true },
      source: "pending",
    });
    const mail = sendEmailBatch.mock.calls[0][0][0].text;
    expect(mail).toContain(
      "This year, everyone is preparing a handmade gift without spending money.",
    );
    expect(mail).not.toContain("0.00");
    expect(sendSignalBatch.mock.calls[0][0][0].text).toContain(
      "This year, everyone is preparing a handmade gift without spending money.",
    );
    expect(
      budgetCopyForGuests(
        TEMPLATE_DEFAULTS,
        "en",
        handmade,
        null,
      ).revealLabel,
    ).toBe("Handmade gift — without spending money.");
    const blankReveal = {
      ...TEMPLATE_DEFAULTS,
      en: { ...TEMPLATE_DEFAULTS.en, "reveal.budget_zero": " " },
    };
    expect(budgetCopy(blankReveal, "en", handmade).revealLabel).toBeNull();
    expect(
      budgetCopy(TEMPLATE_DEFAULTS, "en", {
        budgetKind: "amount",
        budget: null,
      }),
    ).toEqual({ budget: "", budgetLine: "", revealLabel: null });
    expect(budgetCopy(TEMPLATE_DEFAULTS, "en", { budget: 20, currency: "EUR" }).budget).toBe(
      "€20",
    );

    sendEmailBatch.mockClear();
    mockDb.reset();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent({ name: "Office" })]);
    const open = makeDraw({
      id: 3,
      budgetKind: "unlimited",
      budget: null,
      name: "Office",
    });
    mockDb.seed(schema.draw, [open]);
    const openSeed = seedPair([ADA, BEA], open);
    await deliverAssignments({
      ...openSeed,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch.mock.calls[0][0][0].text).toContain(
      "This year, there is no spending limit.",
    );
  });

  it("includes the snapshotted currency in the budget line", async () => {
    const draw = makeDraw({ budget: 40, currency: "PLN", name: "Office" });
    mockDb.seed(schema.draw, [draw]);
    const seeded = seedPair([ADA, BEA], draw);
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(sendEmailBatch.mock.calls[0][0][0].text).toContain(
      "This year's spending limit is PLN\u00A040",
    );
  });

  it("adds a euro equivalent for English guests from snapshotted extras", async () => {
    const draw = makeDraw({
      budget: 100,
      currency: "PLN",
      budgetEur: 22,
      budgetPln: 100,
      budgetJpy: 3989,
      name: "Office",
    });
    mockDb.seed(schema.draw, [draw]);
    const seeded = seedPair(
      [
        { ...ADA, language: "en" },
        { ...BEA, language: "pl" },
      ],
      draw,
    );
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    const mails = sendEmailBatch.mock.calls[0][0];
    expect(mails.find((m) => m.to === "ada@example.com")?.text).toContain(
      "This year's spending limit is PLN\u00A0100 (€22)",
    );
    expect(mails.find((m) => m.to === "bea@example.com")?.text).toContain(
      "Tegoroczny limit wydatków to 100\u00A0zł",
    );
    expect(mails.find((m) => m.to === "bea@example.com")?.text).not.toContain(
      "€",
    );
  });

  it("fills {event} from live per-language event names", async () => {
    mockDb.seed(schema.event, [
      makeEvent({
        id: 1,
        name: "Family Christmas",
        namePl: "Rodzinne Święta",
      }),
    ]);
    const draw = makeDraw({ name: "Xmas" });
    mockDb.seed(schema.draw, [draw]);
    const seeded = seedPair(
      [
        { ...ADA, language: "en", gender: "female" },
        { ...BEA, language: "pl", gender: "female" },
      ],
      draw,
    );
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    const mails = sendEmailBatch.mock.calls[0][0];
    expect(mails.find((m) => m.to === "ada@example.com")?.subject).toBe(
      "🎁 Family Christmas: Find out who you're preparing a present for!",
    );
    expect(mails.find((m) => m.to === "bea@example.com")?.subject).toBe(
      "🎁 Rodzinne Święta: Zobacz, kogo wylosowałaś",
    );
  });

  it("emails a Polish guest with Polish default copy", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ name: "Office", ...eventLocation() }),
    ]);
    const draw = makeDraw({ name: "Office", budget: 25 });
    mockDb.seed(schema.draw, [draw]);
    const seeded = seedPair(
      [
        { ...ADA, language: "pl", gender: "female" },
        { ...BEA, language: "en", gender: "female" },
      ],
      draw,
    );
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    const mails = sendEmailBatch.mock.calls[0][0];
    expect(mails.find((m) => m.to === "ada@example.com")).toEqual({
      to: "ada@example.com",
      revealToken: "tokada000001",
      subject: "🎁 Office: Zobacz, kogo wylosowałaś",
      text: [
        "Droga Ada,",
        "tak jak co roku, w tę Wigilię każdy przynosi prezent dla jednej wylosowanej osoby.",
        "Wynik losowania to tajemnica — tylko Ty wiesz, kogo obdarujesz, a ta osoba nie wie, od kogo dostanie prezent. Jeżeli jest coś, o czym marzysz, możesz dopisać to do swojej listy życzeń jako podpowiedź dla osoby, która Cię wylosowała. Aby sprawdzić, dla kogo przygotowujesz prezent w tym roku, kliknij poniższy przycisk.",
        "Zobacz, kogo obdarujesz\nhttps://santa.test/tokada000001",
        "Najprawdopodobniej spędzimy Święta wszyscy razem w Katowicach, ale gdyby ktoś nie mógł przyjechać, prezent możesz po prostu wysłać pocztą.",
        "Tegoroczny limit wydatków to 25\u00A0€, ale prezent można też zrobić własnoręcznie.",
        "Łącznie w losowaniu biorą udział 2 osoby.",
        "Wesołych Świąt!\n\nPS Jeżeli przycisk nie działa, otwórz ten link: https://santa.test/tokada000001",
      ].join("\n\n"),
      html: expect.stringContaining("https://santa.test/tokada000001"),
    });
    expect(mails.find((m) => m.to === "bea@example.com")?.subject).toBe(
      "🎁 Office: Find out who you're preparing a present for!",
    );
    expect(mails.find((m) => m.to === "bea@example.com")?.text).toContain(
      "spending Christmas in Katowice",
    );
  });

  it("marks WhatsApp delivered only for ok recipients in a mixed batch", async () => {
    sendBatch.mockImplementationOnce(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: i.to === ADA.phone })),
    );
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(result.whatsapp).toEqual({
      sent: 1,
      failed: 1,
      errors: expect.arrayContaining([expect.stringContaining(BEA.phone!)]),
    });
    expect(deliveredOf(1)).toMatchObject({ whatsapp: true });
    expect(deliveredOf(2)).toMatchObject({ whatsapp: false });
  });

  it("marks email delivered only for ok recipients in a mixed batch", async () => {
    sendEmailBatch.mockImplementationOnce(async (inputs) =>
      inputs.map((i) => ({
        to: i.to,
        ok: i.to === "ada@example.com",
        error: i.to === "ada@example.com" ? undefined : "boom",
      })),
    );
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toEqual({ sent: 1, failed: 1 });
    expect(deliveredOf(1)).toMatchObject({ email: true, emailFailed: false });
    expect(deliveredOf(2)).toMatchObject({
      email: false,
      emailFailed: true,
    });
  });

  it("uses a fallback error when an email send fails without a reason", async () => {
    sendEmailBatch.mockImplementationOnce(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: false })),
    );
    const seeded = seedPair();
    const result = await deliverAssignments({
      ...seeded,
      channels: { whatsapp: false, signal: false, email: true },
      source: "pending",
    });
    expect(result.email).toEqual({ sent: 0, failed: 2 });
    expect(deliveredOf(1)).toMatchObject({
      email: false,
      emailFailed: true,
    });
  });

  it("does not mark a channel when every send fails", async () => {
    sendBatch.mockImplementationOnce(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: false, error: "boom" })),
    );
    const seeded = seedPair();
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    expect(deliveredOf(1)).toMatchObject({ whatsapp: false });
    expect(deliveredOf(2)).toMatchObject({ whatsapp: false });
  });

  it("writes invitation_send rows for WhatsApp delivery", async () => {
    const seeded = seedPair();
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    const logs = mockDb.rows(schema.invitationSend);
    expect(logs).toHaveLength(2);
    expect(logs.every((r) => r.channel === "whatsapp")).toBe(true);
    expect(logs.every((r) => r.status === "sent")).toBe(true);
    expect(logs.every((r) => r.source === "pending")).toBe(true);
    expect(new Set(logs.map((r) => r.batchId)).size).toBe(1);
  });

  it("logs a skipped WhatsApp row when a guest has no phone", async () => {
    const seeded = seedPair([ADA, { ...BEA, phone: null }]);
    await deliverAssignments({
      ...seeded,
      channels: { whatsapp: true, signal: false, email: false },
      source: "pending",
    });
    const logs = mockDb.rows(schema.invitationSend);
    expect(logs).toHaveLength(2);
    expect(logs.find((r) => r.assignmentId === 1)).toMatchObject({
      status: "sent",
      channel: "whatsapp",
    });
    expect(logs.find((r) => r.assignmentId === 2)).toMatchObject({
      status: "skipped",
      channel: "whatsapp",
      error: "Bea has no phone number",
    });
  });
});
