import { describe, expect, it, vi } from "vitest";
import * as drawLib from "@/lib/draw";
import { DrawError } from "@/lib/draw";
import type { Language } from "@/lib/language";
import {
  addManualPair,
  executeDraw,
  setAutomaticExclusions,
  startDraw,
} from "@/lib/draw-runner";
import * as ids from "@/lib/ids";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeExclusion,
  makeGuest,
  makePerson,
  makeSeries,
  polishNameCases,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

const ADA = {
  id: 1,
  name: "Ada",
  phone: "351911111111" as string | null,
  userId: "user_ada" as string | null,
  eventId: 1,
};
const BEA = {
  id: 2,
  name: "Bea",
  phone: "351922222222" as string | null,
  userId: "user_bea" as string | null,
  eventId: 1,
};

function seedSeats(
  people: Array<{
    id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    language?: Language;
    userId?: string | null;
    eventId?: number;
  }>,
) {
  const uniquePeople = new Map<number, ReturnType<typeof makePerson>>();
  for (const p of people) {
    if (!uniquePeople.has(p.id)) {
      uniquePeople.set(
        p.id,
        makePerson({
          id: p.id,
          name: p.name,
          phone: p.phone ?? null,
          email: p.email ?? null,
          ...(p.language ? { language: p.language } : {}),
          userId: p.userId ?? null,
        }),
      );
    }
  }
  mockDb.seed(schema.person, [...uniquePeople.values()]);
  mockDb.seed(
    schema.guest,
    people.map((p) =>
      makeGuest({
        id: p.id,
        personId: p.id,
        eventId: p.eventId ?? 1,
      }),
    ),
  );
}

function seedWorld(
  draw: ReturnType<typeof makeDraw>,
  people: Parameters<typeof seedSeats>[0] = [ADA, BEA],
) {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({ id: draw.eventId ?? 1, name: draw.name }),
  ]);
  seedSeats(people);
  mockDb.seed(schema.draw, [draw]);
}

function assignmentInserts() {
  return mockDb.inserts
    .filter((c) => c.table === schema.assignment)
    .flatMap((c) => (Array.isArray(c.values) ? c.values : [c.values]));
}

function selectedTables(): unknown[] {
  const tables: unknown[] = [];
  const orig = mockDb.db.select.bind(mockDb.db) as (...args: unknown[]) => {
    from: (table: unknown) => unknown;
  };
  vi.spyOn(mockDb.db, "select").mockImplementation((...args: unknown[]) => {
    const chain = orig(...args);
    const from = chain.from.bind(chain);
    chain.from = (table: unknown) => {
      tables.push(table);
      return from(table);
    };
    return chain as never;
  });
  return tables;
}

describe("executeDraw", () => {
  it("throws DrawError when there are fewer than 2 participants", async () => {
    seedWorld(makeDraw(), [ADA]);
    await expect(executeDraw(makeDraw())).rejects.toThrow(DrawError);
    await expect(executeDraw(makeDraw())).rejects.toThrow(
      "Need at least 2 participants to run a draw.",
    );
    expect(assignmentInserts()).toHaveLength(0);
  });

  it("throws DrawError when there are no participants", async () => {
    seedWorld(makeDraw(), []);
    await expect(executeDraw(makeDraw())).rejects.toThrow(
      "Need at least 2 participants to run a draw.",
    );
  });

  it("does not query history and passes empty history when avoidPastPairings is off", async () => {
    const draw = makeDraw({ id: 10, avoidPastPairings: false });
    seedWorld(draw);
    mockDb.add(
      schema.draw,
      makeDraw({
        id: 9,
        name: "Older",
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
      }),
    );
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 9, giverId: 1, receiverId: 2 }),
    ]);
    const tables = selectedTables();
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(draw);

    expect(tables).not.toContain(schema.draw);
    expect(runDraw).toHaveBeenCalledWith(
      [1, 2],
      [],
      [],
      { allowSelfDraw: false },
    );
  });

  it("excludes the current draw and uses every prior series draw when avoidPastPairings is on", async () => {
    const current = makeDraw({
      id: 10,
      eventId: 4,
      avoidPastPairings: true,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2023-01-01", code: "xmas_2023" }),
      makeEvent({ id: 2, occursOn: "2024-01-01", code: "xmas_2024" }),
      makeEvent({ id: 3, occursOn: "2025-01-01", code: "xmas_2025" }),
      makeEvent({ id: 4, occursOn: "2026-01-01", code: "xmas_2026" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 11, eventId: 1, personId: 1 }),
      makeGuest({ id: 12, eventId: 1, personId: 2 }),
      makeGuest({ id: 21, eventId: 2, personId: 1 }),
      makeGuest({ id: 22, eventId: 2, personId: 2 }),
      makeGuest({ id: 31, eventId: 3, personId: 1 }),
      makeGuest({ id: 32, eventId: 3, personId: 2 }),
      makeGuest({ id: 1, eventId: 4, personId: 1 }),
      makeGuest({ id: 2, eventId: 4, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      current,
      makeDraw({
        id: 7,
        eventId: 1,
        name: "Too old",
        createdAt: new Date("2023-01-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 8,
        eventId: 2,
        name: "Previous",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 9,
        eventId: 3,
        name: "Last",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 4, drawId: 7, giverId: 11, receiverId: 12 }),
      makeAssignment({ id: 3, drawId: 8, giverId: 22, receiverId: 21 }),
      makeAssignment({ id: 2, drawId: 9, giverId: 31, receiverId: 32 }),
    ]);
    const tables = selectedTables();
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(current);

    expect(tables).toContain(schema.assignment);
    expect(runDraw).toHaveBeenCalledWith(
      [1, 2],
      [],
      [[[1, 2]], [[2, 1]], [[1, 2]]],
      { allowSelfDraw: false },
    );
    expect(mockDb.rows(schema.draw).find((d) => d.id === 10)).toMatchObject({
      historyLayers: 3,
      layersDropped: 3,
      relaxedRestrictions: true,
    });
  });

  it("does not treat later editions as past pairings", async () => {
    const current = makeDraw({
      id: 10,
      eventId: 1,
      avoidPastPairings: true,
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2026-11-13", code: "shop_2026" }),
      makeEvent({ id: 2, occursOn: "2027-11-13", code: "shop_2027" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 10, eventId: 2, personId: 1 }),
      makeGuest({ id: 11, eventId: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      current,
      makeDraw({
        id: 20,
        eventId: 2,
        name: "Next year",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 20, giverId: 10, receiverId: 11 }),
    ]);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(current);

    expect(runDraw).toHaveBeenCalledWith([1, 2], [], [], {
      allowSelfDraw: false,
    });
    expect(mockDb.rows(schema.draw).find((d) => d.id === 10)).toMatchObject({
      historyLayers: 0,
      layersDropped: 0,
      relaxedRestrictions: false,
    });
  });

  it("forwards allowSelfDraw to runDraw", async () => {
    const draw = makeDraw({ allowSelfDraw: true });
    seedWorld(draw);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(draw);

    expect(runDraw).toHaveBeenCalledWith(
      [1, 2],
      [],
      [],
      { allowSelfDraw: true },
    );
  });

  it("always inserts assignments with reveal tokens", async () => {
    const draw = makeDraw({ id: 3 });
    seedWorld(draw);

    const result = await executeDraw(draw);

    const rows = assignmentInserts();
    expect(rows).toHaveLength(2);
    expect(result.assignments).toBe(2);
    const tokens = rows.map((r) => r.revealToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const row of rows) {
      expect(row.drawId).toBe(3);
      expect(typeof row.revealToken).toBe("string");
      expect(row.revealToken).toMatch(/^[0-9a-z]{6}$/);
      expect([1, 2]).toContain(row.giverId);
      expect([1, 2]).toContain(row.receiverId);
    }
    const givers = rows.map((r) => r.giverId).sort();
    const receivers = rows.map((r) => r.receiverId).sort();
    expect(givers).toEqual([1, 2]);
    expect(receivers).toEqual([1, 2]);
  });

  it("marks the draw completed and sets executedAt", async () => {
    const draw = makeDraw({ id: 4, executedAt: null });
    seedWorld(draw);

    const result = await executeDraw(draw);

    expect(result.draw.status).toBe("completed");
    expect(result.draw.executedAt).toBeInstanceOf(Date);
    expect(mockDb.updates.some((u) => u.table === schema.draw)).toBe(true);
    const stored = mockDb.rows(schema.draw)[0];
    expect(stored.status).toBe("completed");
    expect(stored.executedAt).toBeInstanceOf(Date);
  });

  it("persists solver stats on the completed draw", async () => {
    const draw = makeDraw({ id: 4, executedAt: null });
    seedWorld(draw);
    vi.spyOn(drawLib, "runDraw").mockReturnValue({
      pairs: new Map([
        [1, 2],
        [2, 1],
      ]),
      attempts: 12,
      durationMs: 34,
      layersDropped: 1,
      relaxedRestrictions: true,
    });

    const result = await executeDraw(draw);

    expect(result.draw).toMatchObject({
      status: "completed",
      durationMs: 34,
      attempts: 12,
      historyLayers: 0,
      layersDropped: 1,
      relaxedRestrictions: true,
    });
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      durationMs: 34,
      attempts: 12,
      historyLayers: 0,
      layersDropped: 1,
      relaxedRestrictions: true,
    });
  });

  it("only draws guests from the same edition", async () => {
    const family = makeDraw({ id: 10, eventId: 1 });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, seriesId: 1, code: "xmas_20270101" }),
    ]);
    seedSeats([
      { id: 1, name: "Ada", eventId: 1 },
      { id: 2, name: "Bea", eventId: 1 },
      { id: 3, name: "Cara", eventId: 2 },
      { id: 4, name: "Dan", eventId: 2 },
    ]);
    mockDb.seed(schema.exclusion, [
      makeExclusion({ id: 1, eventId: 2, aId: 3, bId: 4 }),
    ]);
    mockDb.seed(schema.draw, [family]);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(family);

    expect(runDraw).toHaveBeenCalledWith([1, 2], [], [], {
      allowSelfDraw: false,
    });
    const givers = assignmentInserts().map((r) => r.giverId).sort();
    expect(givers).toEqual([1, 2]);
  });

  it("ignores history from another series", async () => {
    const office = makeDraw({
      id: 20,
      eventId: 2,
      avoidPastPairings: true,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    });
    mockDb.seed(schema.eventSeries, [
      makeSeries(),
      makeSeries({ id: 2, name: "Office", slug: "office" }),
    ]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, seriesId: 1 }),
      makeEvent({
        id: 2,
        seriesId: 2,
        occursOn: "2026-01-01",
        code: "office_2026",
      }),
      makeEvent({
        id: 3,
        seriesId: 2,
        occursOn: "2025-01-01",
        code: "office_2025",
      }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cara" }),
      makePerson({ id: 4, name: "Dan" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 1, personId: 2 }),
      makeGuest({ id: 3, eventId: 2, personId: 3 }),
      makeGuest({ id: 4, eventId: 2, personId: 4 }),
      makeGuest({ id: 13, eventId: 3, personId: 3 }),
      makeGuest({ id: 14, eventId: 3, personId: 4 }),
    ]);
    mockDb.seed(schema.draw, [
      office,
      makeDraw({
        id: 10,
        eventId: 1,
        name: "Family last year",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      }),
      makeDraw({
        id: 19,
        eventId: 3,
        name: "Office last year",
        createdAt: new Date("2025-01-02T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 10, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, drawId: 19, giverId: 13, receiverId: 14 }),
    ]);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(office);

    expect(runDraw).toHaveBeenCalledWith(
      [3, 4],
      [],
      [[[3, 4]]],
      { allowSelfDraw: false },
    );
  });

  it("remaps last year's pairs onto this edition's guest ids via person", async () => {
    const current = makeDraw({
      id: 20,
      eventId: 2,
      avoidPastPairings: true,
      createdAt: new Date("2026-12-25T00:00:00.000Z"),
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1, occursOn: "2025-12-24", code: "xmas_20251224" }),
      makeEvent({ id: 2, occursOn: "2026-12-25", code: "xmas_20261225" }),
    ]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 10, eventId: 1, personId: 1 }),
      makeGuest({ id: 11, eventId: 1, personId: 2 }),
      makeGuest({ id: 20, eventId: 2, personId: 1 }),
      makeGuest({ id: 21, eventId: 2, personId: 2 }),
    ]);
    mockDb.seed(schema.draw, [
      current,
      makeDraw({
        id: 19,
        eventId: 1,
        name: "Last year",
        createdAt: new Date("2025-12-24T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 19, giverId: 10, receiverId: 11 }),
    ]);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(current);

    expect(runDraw).toHaveBeenCalledWith(
      [20, 21],
      [],
      [[[20, 21]]],
      { allowSelfDraw: false },
    );
  });

  it("only inserts leftover pairs and keeps existing tokens", async () => {
    const cal = { id: 3, name: "Cal", phone: null, userId: null, eventId: 1 };
    const dot = { id: 4, name: "Dot", phone: null, userId: null, eventId: 1 };
    const draw = makeDraw({ id: 5 });
    seedWorld(draw, [ADA, BEA, cal, dot]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 10,
        drawId: 5,
        giverId: 1,
        receiverId: 2,
        revealToken: "tokada",
      }),
      makeAssignment({
        id: 11,
        drawId: 5,
        giverId: 2,
        receiverId: 1,
        revealToken: "tokbea",
      }),
    ]);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    const result = await executeDraw(draw);

    expect(runDraw).toHaveBeenCalledWith([3, 4], [], [], {
      allowSelfDraw: false,
    });
    const inserted = assignmentInserts();
    expect(inserted).toHaveLength(2);
    expect(inserted.map((r) => r.giverId).sort()).toEqual([3, 4]);
    expect(
      mockDb.rows(schema.assignment).find((r) => r.giverId === 1)?.revealToken,
    ).toBe("tokada");
    expect(
      mockDb.rows(schema.assignment).find((r) => r.giverId === 2)?.revealToken,
    ).toBe("tokbea");
    expect(result.assignments).toBe(4);
    expect(result).not.toHaveProperty("delivery");
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
  });

  it("does not send invitations even when delivery channels are enabled", async () => {
    const draw = makeDraw({
      deliverWhatsapp: true,
      deliverSignal: true,
      deliverEmail: true,
    });
    seedWorld(draw);

    const result = await executeDraw(draw);

    expect(result).not.toHaveProperty("delivery");
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
    expect(
      mockDb.rows(schema.assignment).every(
        (row) =>
          !row.deliveredWhatsapp &&
          !row.deliveredSignal &&
          !row.deliveredEmail,
      ),
    ).toBe(true);
  });

  it("throws when every guest already has someone to give to", async () => {
    const draw = makeDraw({ id: 6 });
    seedWorld(draw);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 6, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, drawId: 6, giverId: 2, receiverId: 1 }),
    ]);

    await expect(executeDraw(draw)).rejects.toThrow(
      "Everyone already has someone to give to.",
    );
    expect(assignmentInserts()).toHaveLength(0);
  });

  it("assigns a leftover giver onto a leftover receiver who already gives", async () => {
    const cal = { id: 3, name: "Cal", phone: null, userId: null, eventId: 1 };
    const draw = makeDraw({ id: 7 });
    seedWorld(draw, [ADA, BEA, cal]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 7, giverId: 2, receiverId: 3 }),
      makeAssignment({ id: 2, drawId: 7, giverId: 3, receiverId: 1 }),
    ]);
    const runDraw = vi.spyOn(drawLib, "runDraw");

    await executeDraw(draw);

    expect(runDraw).toHaveBeenCalledWith([1], [], [], {
      allowSelfDraw: false,
      receivers: [2],
    });
    expect(assignmentInserts()).toEqual([
      expect.objectContaining({ giverId: 1, receiverId: 2, drawId: 7 }),
    ]);
  });

  it("throws DrawError when the edition is missing", async () => {
    await expect(executeDraw(makeDraw({ eventId: 99 }))).rejects.toThrow(
      "Unknown event.",
    );
  });

  it("maps UNIQUE constraint failures to a retry error", async () => {
    seedWorld(makeDraw());
    vi.spyOn(mockDb.db, "transaction").mockImplementation(() => {
      throw new Error("UNIQUE constraint failed: assignment.reveal_token");
    });
    await expect(executeDraw(makeDraw())).rejects.toThrow(
      "Draw changed, retry.",
    );
  });

  it("throws when leftover giver and receiver counts differ", async () => {
    seedWorld(makeDraw(), [ADA, BEA, { id: 3, name: "Cyd", phone: null, userId: null, eventId: 1 }]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        giverId: 1,
        receiverId: 99,
        revealToken: "toktoktoktok",
      }),
    ]);
    await expect(executeDraw(makeDraw())).rejects.toThrow(/inconsistent/);
  });

  it("throws when a unique reveal token cannot be allocated", async () => {
    seedWorld(makeDraw());
    vi.spyOn(ids, "revealToken").mockReturnValue("aaaaaaaaaaaa");
    await expect(executeDraw(makeDraw())).rejects.toThrow(
      "Could not allocate a reveal token.",
    );
  });
});

describe("startDraw", () => {
  it("runs when guests have full Polish cases and no gender", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        gender: null,
        ...polishNameCases("Ada"),
      }),
      makePerson({
        id: 2,
        name: "Bea",
        gender: null,
        ...polishNameCases("Bea"),
      }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
    ]);
    const result = await startDraw(makeEvent());
    expect(result.assignments).toBe(2);
  });

  it("runs when guests are missing Polish cases", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    seedSeats([ADA, BEA]);
    const result = await startDraw(makeEvent());
    expect(result.assignments).toBe(2);
  });

  it("runs when the event date is blank", async () => {
    const event = makeEvent({ occursOn: "" });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    seedSeats([ADA, BEA]);
    const result = await startDraw(event);
    expect(result.assignments).toBe(2);
  });

  it("throws when there are no guests", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    await expect(startDraw(makeEvent())).rejects.toThrow(
      "Need at least 2 participants to run a draw.",
    );
  });

  it("stores a positive amount with no kind as amount on a new draw", async () => {
    const event = makeEvent({
      budgetKind: null,
      budget: 40,
      currency: "PLN",
      budgetEur: 10,
      budgetPln: 40,
      budgetJpy: 1600,
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    seedSeats([ADA, BEA]);
    await startDraw(event);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      budgetKind: "amount",
      budget: 40,
      currency: "PLN",
      budgetEur: 10,
      budgetPln: 40,
      budgetJpy: 1600,
    });
  });

  it("copies an explicit make-the-gift choice onto a new draw", async () => {
    const event = makeEvent({ budgetKind: "zero", budget: 40, currency: "EUR" });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [event]);
    seedSeats([ADA, BEA]);
    await startDraw(event);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      budgetKind: "zero",
      budget: 40,
      currency: "EUR",
    });
  });

  it("defaults a missing currency to EUR when inserting a draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    seedSeats([ADA, BEA]);
    await startDraw({ ...makeEvent(), currency: undefined as never });
    expect(mockDb.rows(schema.draw)[0]?.currency).toBe("EUR");
  });

  it("maps UNIQUE constraint failures to a retry error", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    seedSeats([ADA, BEA]);
    vi.spyOn(mockDb.db, "transaction").mockImplementation(() => {
      throw new Error("UNIQUE constraint failed: assignment.giver_id");
    });
    await expect(startDraw(makeEvent())).rejects.toThrow(
      "Draw changed, retry.",
    );
  });

  it("fills leftover pairs without sending or clearing delivery flags", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    seedSeats([
      ADA,
      BEA,
      { id: 3, name: "Cal", phone: null, userId: null, eventId: 1 },
      { id: 4, name: "Dot", phone: null, userId: null, eventId: 1 },
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        deliverWhatsapp: true,
        deliverSignal: true,
        deliverEmail: true,
        allowSelfDraw: true,
        avoidPastPairings: true,
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 10,
        giverId: 1,
        receiverId: 2,
        revealToken: "tokada000001",
      }),
      makeAssignment({
        id: 11,
        giverId: 2,
        receiverId: 1,
        revealToken: "tokbea000001",
      }),
    ]);

    const result = await startDraw(makeEvent());

    expect(result.assignments).toBe(4);
    expect(result).not.toHaveProperty("delivery");
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      deliverWhatsapp: true,
      deliverSignal: true,
      deliverEmail: true,
      allowSelfDraw: false,
      avoidPastPairings: false,
    });
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
    expect(
      mockDb
        .rows(schema.assignment)
        .filter((row) => row.giverId === 3 || row.giverId === 4)
        .every(
          (row) =>
            !row.deliveredWhatsapp &&
            !row.deliveredSignal &&
            !row.deliveredEmail,
        ),
    ).toBe(true);
  });

  it("copies edition automatic exclusions onto the draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    const event = makeEvent({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, occursOn: "2025-01-01", code: "older1" }),
      event,
    ]);
    seedSeats([ADA, BEA]);
    const result = await startDraw(event);
    expect(result.draw).toMatchObject({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
  });

  it("does not apply avoidPastPairings when there is no earlier edition", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    const event = makeEvent({ avoidPastPairings: true });
    mockDb.seed(schema.event, [event]);
    seedSeats([ADA, BEA]);
    await startDraw(event);
    expect(mockDb.rows(schema.draw)[0].avoidPastPairings).toBe(false);
  });
});

describe("addManualPair", () => {
  it("maps UNIQUE constraint failures to a retry error", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    seedSeats([ADA, BEA]);
    vi.spyOn(mockDb.db, "transaction").mockImplementation(() => {
      throw new Error("UNIQUE constraint failed: assignment.receiver_id");
    });
    await expect(
      addManualPair(makeEvent(), { giverId: 1, receiverId: 2 }),
    ).rejects.toThrow("Draw changed, retry.");
  });

  it("creates a draw from the edition automatic exclusions", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    const event = makeEvent({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
    mockDb.seed(schema.event, [
      makeEvent({ id: 2, occursOn: "2025-01-01", code: "older1" }),
      event,
    ]);
    seedSeats([ADA, BEA]);
    const result = await addManualPair(event, { giverId: 1, receiverId: 1 });
    expect(result.draw).toMatchObject({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
    expect(result.assignment).toMatchObject({ giverId: 1, receiverId: 1 });
  });
});

describe("setAutomaticExclusions", () => {
  it("saves on the edition when there is no draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    await expect(
      setAutomaticExclusions(1, {
        allowSelfDraw: true,
        avoidPastPairings: true,
      }),
    ).resolves.toBeNull();
    expect(mockDb.rows(schema.event)[0]).toMatchObject({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
  });

  it("updates the current draw as well", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw()]);
    await expect(
      setAutomaticExclusions(1, { allowSelfDraw: true }),
    ).resolves.toMatchObject({
      allowSelfDraw: true,
      avoidPastPairings: false,
    });
    expect(mockDb.rows(schema.event)[0].allowSelfDraw).toBe(true);
    expect(mockDb.rows(schema.draw)[0].allowSelfDraw).toBe(true);
  });

  it("returns the current draw when no flags are set", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw({ allowSelfDraw: true })]);
    await expect(setAutomaticExclusions(1, {})).resolves.toMatchObject({
      allowSelfDraw: true,
    });
  });

  it("returns null when no flags are set and there is no draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    await expect(setAutomaticExclusions(1, {})).resolves.toBeNull();
  });

  it("throws for an unknown event", async () => {
    await expect(
      setAutomaticExclusions(9, { allowSelfDraw: true }),
    ).rejects.toThrow("Unknown event.");
  });
});
