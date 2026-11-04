import { beforeEach, describe, expect, it, vi } from "vitest";
import * as drawLib from "@/lib/draw";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeAssignment,
  makeDraw,
  makeEvent,
  makeExclusion,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams, emptyRequest, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/whatsapp", () => ({
  isWhatsAppConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/signal", () => ({
  isSignalConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(async () => false),
  sendEmailBatch: vi.fn(async () => []),
  clipEmailFailReason: (reason: string) => reason,
}));

import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { isSignalConfigured } from "@/lib/signal";
import { isEmailConfigured } from "@/lib/email";
import { GET, PATCH, POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

const isWhatsAppConfiguredMock = vi.mocked(isWhatsAppConfigured);
const isSignalConfiguredMock = vi.mocked(isSignalConfigured);
const isEmailConfiguredMock = vi.mocked(isEmailConfigured);

function seedTwoGuests() {
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 1, personId: 1 }),
    makeGuest({ id: 2, personId: 2 }),
  ]);
}

describe("GET /api/e/[code]/draw", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`),
      codeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns an empty array before a draw", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns the latest draw in an array", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 4, status: "completed" })]);
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ id: 4, eventId: 1 }),
    ]);
  });
});

describe("POST /api/e/[code]/draw", () => {
  beforeEach(async () => {
    await asAdmin();
    isWhatsAppConfiguredMock.mockReset();
    isWhatsAppConfiguredMock.mockResolvedValue(false);
    isSignalConfiguredMock.mockReset();
    isSignalConfiguredMock.mockReturnValue(false);
    isEmailConfiguredMock.mockReset();
    isEmailConfiguredMock.mockResolvedValue(false);
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(401);
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
  });

  it("rejects a draw with fewer than 2 guests", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Need at least 2 participants to run a draw.",
    });
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
  });

  it("returns the completed draw without sending invitations", async () => {
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignments).toBe(2);
    expect(body.draw).toEqual(expect.objectContaining({ eventId: 1 }));
    expect(body).not.toHaveProperty("delivery");
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
  });

  it("ignores delivery flags in the body and still runs the draw", async () => {
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {
        deliverWhatsapp: true,
        deliverEmail: true,
      }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      deliverWhatsapp: false,
      deliverSignal: false,
      deliverEmail: false,
    });
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
  });

  it("copies edition avoidPastPairings onto the draw", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ avoidPastPairings: true }),
      makeEvent({ id: 2, occursOn: "2025-01-01", code: "older1" }),
    ]);
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {
        avoidPastPairings: false,
      }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    expect(mockDb.rows(schema.draw)[0].avoidPastPairings).toBe(true);
  });

  it("defaults avoidPastPairings to false", async () => {
    seedTwoGuests();

    await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(mockDb.rows(schema.draw)[0].avoidPastPairings).toBe(false);
  });

  it("reuses the current draw on success", async () => {
    seedTwoGuests();
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, name: "Old", status: "completed" }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(201);
    const draws = mockDb.rows(schema.draw);
    expect(draws).toHaveLength(1);
    expect(draws[0].id).toBe(1);
    expect(draws[0].name).toBe("Old");
  });

  it("fills leftover guests without sending or clearing delivery flags", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cal" }),
      makePerson({ id: 4, name: "Dot" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
      makeGuest({ id: 3, personId: 3 }),
      makeGuest({ id: 4, personId: 4 }),
    ]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        status: "completed",
        deliverWhatsapp: true,
        deliverSignal: true,
        deliverEmail: true,
      }),
    ]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, drawId: 1, giverId: 2, receiverId: 1 }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignments).toBe(4);
    expect(body).not.toHaveProperty("delivery");
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      deliverWhatsapp: true,
      deliverSignal: true,
      deliverEmail: true,
    });
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
  });

  it("keeps the previous draw when the solve fails", async () => {
    seedTwoGuests();
    mockDb.seed(schema.draw, [
      makeDraw({ id: 1, name: "Old", status: "completed" }),
    ]);
    mockDb.seed(schema.exclusion, [makeExclusion({ aId: 1, bId: 2 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(400);
    const draws = mockDb.rows(schema.draw);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ id: 1, name: "Old" });
  });

  it("returns 400 when every guest already has a match", async () => {
    seedTwoGuests();
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 1, receiverId: 2 }),
      makeAssignment({ id: 2, drawId: 1, giverId: 2, receiverId: 1 }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Everyone already has someone to give to.",
    });
  });

  it("does not persist a draw when the solve fails", async () => {
    seedTwoGuests();
    mockDb.seed(schema.exclusion, [makeExclusion({ aId: 1, bId: 2 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(400);
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
  });

  it("does not persist a draw when the solver throws unexpectedly", async () => {
    seedTwoGuests();
    const spy = vi.spyOn(drawLib, "runDraw").mockImplementation(() => {
      throw new Error("connection lost");
    });

    await expect(
      POST(
        jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
        codeParams(),
      ),
    ).rejects.toThrow("connection lost");
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
    spy.mockRestore();
  });

  it("snapshots the event name, budget and currency", async () => {
    mockDb.seed(schema.event, [
      makeEvent({
        budget: 40,
        currency: "PLN",
        budgetEur: 9,
        budgetPln: 40,
        budgetJpy: 1500,
      }),
    ]);
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}),
      codeParams(),
    );

    expect(res.status).toBe(201);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      name: "Xmas",
      budgetKind: "amount",
      budget: 40,
      currency: "PLN",
      budgetEur: 9,
      budgetPln: 40,
      budgetJpy: 1500,
    });
  });
});

describe("PATCH /api/e/[code]/draw", () => {
  beforeEach(async () => {
    await asAdmin();
    isWhatsAppConfiguredMock.mockReset();
    isWhatsAppConfiguredMock.mockResolvedValue(false);
    isSignalConfiguredMock.mockReset();
    isSignalConfiguredMock.mockReturnValue(false);
    isEmailConfiguredMock.mockReset();
    isEmailConfiguredMock.mockResolvedValue(false);
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("updates delivery flags on the current draw", async () => {
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);
    isSignalConfiguredMock.mockReturnValue(true);
    isEmailConfiguredMock.mockResolvedValue(true);

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        {
          deliverWhatsapp: false,
          deliverSignal: true,
          deliverEmail: true,
        },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      deliverWhatsapp: false,
      deliverSignal: true,
      deliverEmail: true,
    });
  });

  it("rejects Signal when it is not linked", async () => {
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        { deliverSignal: true },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(400);
    expect(mockDb.rows(schema.draw)[0].deliverSignal).toBe(false);
  });

  it("rejects email when it is not configured", async () => {
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        { deliverEmail: true },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(400);
    expect(mockDb.rows(schema.draw)[0].deliverEmail).toBe(false);
  });

  it("rejects delivery flags when there is no draw yet", async () => {
    isEmailConfiguredMock.mockResolvedValue(true);
    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        { deliverEmail: true },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Run the draw before choosing delivery channels.",
    });
  });

  it("saves automatic exclusions before a draw exists", async () => {
    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        { allowSelfDraw: true, avoidPastPairings: true },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ draw: null });
    expect(mockDb.rows(schema.event)[0]).toMatchObject({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
  });

  it("updates automatic exclusions on the current draw", async () => {
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        { allowSelfDraw: true },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draw).toMatchObject({ allowSelfDraw: true });
    expect(mockDb.rows(schema.event)[0].allowSelfDraw).toBe(true);
    expect(mockDb.rows(schema.draw)[0].allowSelfDraw).toBe(true);
  });

  it("updates delivery flags and automatic exclusions together", async () => {
    mockDb.seed(schema.draw, [makeDraw({ status: "completed" })]);
    isEmailConfiguredMock.mockResolvedValue(true);

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/draw`,
        { deliverEmail: true, allowSelfDraw: true },
        { method: "PATCH" },
      ),
      codeParams(),
    );

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      deliverEmail: true,
      allowSelfDraw: true,
    });
    expect(mockDb.rows(schema.event)[0].allowSelfDraw).toBe(true);
  });

  it("returns the current draw when the body is empty", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 4, status: "completed" })]);
    const res = await PATCH(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}, { method: "PATCH" }),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      draw: expect.objectContaining({ id: 4 }),
    });
  });

  it("returns null when the body is empty and there is no draw", async () => {
    const res = await PATCH(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/draw`, {}, { method: "PATCH" }),
      codeParams(),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ draw: null });
  });
});
