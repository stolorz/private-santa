import { describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeGuest,
  makePerson,
} from "@/test/helpers/fixtures";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { currentDrawResultsCsv } from "@/lib/draw-results";
import { renderDrawResultsCsv } from "@/lib/draw-results-csv";

function seat(
  guestId: number,
  name: string,
  opts: { personId?: number; eventId?: number } = {},
) {
  const personId = opts.personId ?? guestId;
  return {
    person: makePerson({ id: personId, name }),
    guest: makeGuest({
      id: guestId,
      personId,
      eventId: opts.eventId ?? 1,
    }),
  };
}

function seedSeats(
  seats: Array<{ person: ReturnType<typeof makePerson>; guest: ReturnType<typeof makeGuest> }>,
) {
  mockDb.seed(
    schema.person,
    seats.map((row) => row.person),
  );
  mockDb.seed(
    schema.guest,
    seats.map((row) => row.guest),
  );
}

describe("currentDrawResultsCsv", () => {
  it("returns null when the edition has no draw", async () => {
    await expect(
      currentDrawResultsCsv(makeEvent({ id: 1 })),
    ).resolves.toBeNull();
  });

  it("exports one pair using the person's name, not the guest id", async () => {
    const helena = seat(7, "Helena", { personId: 3 });
    const igor = seat(8, "Igor", { personId: 4 });
    seedSeats([helena, igor]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1, eventId: 1 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 7, receiverId: 8 }),
    ]);

    const file = await currentDrawResultsCsv(
      makeEvent({ id: 1, occursOn: "2026-12-24" }),
    );

    expect(file).toEqual({
      filename: "draw_results_2026.csv",
      body: renderDrawResultsCsv([{ giver: "Helena", receiver: "Igor" }]),
    });
    expect(file?.body).not.toContain("7");
    expect(file?.body).not.toContain("8");
  });

  it("exports every pair on the current draw", async () => {
    seedSeats([seat(1, "Bea"), seat(2, "Ada"), seat(3, "Cora")]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, giverId: 2, receiverId: 3 }),
      makeAssignment({ id: 3, giverId: 3, receiverId: 1 }),
    ]);

    const file = await currentDrawResultsCsv(makeEvent());

    expect(file?.filename).toBe("draw_results_2026.csv");
    expect(file?.body).toBe(
      renderDrawResultsCsv([
        { giver: "Bea", receiver: "Ada" },
        { giver: "Ada", receiver: "Cora" },
        { giver: "Cora", receiver: "Bea" },
      ]),
    );
  });

  it("omits guests who are not in the current pairing", async () => {
    seedSeats([seat(1, "Ada"), seat(2, "Bea"), seat(3, "Cora")]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, giverId: 1, receiverId: 2 }),
    ]);

    const file = await currentDrawResultsCsv(makeEvent());

    expect(file?.body).toBe(
      renderDrawResultsCsv([{ giver: "Ada", receiver: "Bea" }]),
    );
    expect(file?.body).not.toContain("Cora");
  });

  it("uses the newest draw and ignores an older one", async () => {
    seedSeats([
      seat(1, "Ada"),
      seat(2, "Bea"),
      seat(3, "Cora"),
      seat(4, "Dan"),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 2,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 3,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, drawId: 2, giverId: 3, receiverId: 4 }),
      makeAssignment({ id: 3, drawId: 3, giverId: 2, receiverId: 1 }),
    ]);

    const file = await currentDrawResultsCsv(makeEvent());

    expect(file?.body).toBe(
      renderDrawResultsCsv([{ giver: "Cora", receiver: "Dan" }]),
    );
    expect(file?.body).not.toContain("Ada");
    expect(file?.body).not.toContain("Bea");
  });

  it("skips a pair when the giver or the receiver has no name on this edition", async () => {
    seedSeats([
      seat(1, "Ada"),
      seat(2, "Bea"),
      seat(3, "Cora", { eventId: 2 }),
      seat(4, "Dan", { eventId: 2 }),
    ]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1, eventId: 1 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 99, receiverId: 1 }),
      makeAssignment({ id: 2, drawId: 1, giverId: 2, receiverId: 98 }),
      makeAssignment({ id: 3, drawId: 1, giverId: 3, receiverId: 4 }),
      makeAssignment({ id: 4, drawId: 1, giverId: 1, receiverId: 2 }),
    ]);

    const file = await currentDrawResultsCsv(makeEvent({ id: 1 }));

    expect(file?.body).toBe(
      renderDrawResultsCsv([{ giver: "Ada", receiver: "Bea" }]),
    );
    expect(file?.body).not.toContain("Cora");
    expect(file?.body).not.toContain("Dan");
    expect(file?.body).not.toContain("99");
    expect(file?.body).not.toContain("98");
  });

  it("writes only the header when the current draw has no pairs", async () => {
    seedSeats([seat(1, "Ada")]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);

    const file = await currentDrawResultsCsv(
      makeEvent({ occursOn: "2026-02-31" }),
    );

    expect(file).toEqual({
      filename: "draw_results.csv",
      body: renderDrawResultsCsv([]),
    });
    expect(file?.body).not.toContain("Ada");
  });

  it("uses a yearless file name when the party date is blank", async () => {
    seedSeats([seat(1, "Ada"), seat(2, "Bea")]);
    mockDb.seed(schema.draw, [makeDraw()]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ giverId: 1, receiverId: 2 }),
    ]);

    const file = await currentDrawResultsCsv(makeEvent({ occursOn: "" }));

    expect(file?.filename).toBe("draw_results.csv");
    expect(file?.body).toContain("Ada");
  });
});
