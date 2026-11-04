import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeAssignment,
  makeDraw,
  makeEvent,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { DELETE, PATCH } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


const ALL_ON = {
  whatsapp: true,
  signal: true,
  email: true,
  manual: true,
};

function params(token: string) {
  return codeParams(FIXTURE_EVENT_CODE, { token });
}

function seedAssignment(overrides: Parameters<typeof makeAssignment>[0] = {}) {
  mockDb.seed(schema.draw, [makeDraw({ id: 1, eventId: 1 })]);
  mockDb.seed(schema.assignment, [
    makeAssignment({
      id: 1,
      drawId: 1,
      revealToken: "tok-ada",
      ...overrides,
    }),
  ]);
}

describe("PATCH /api/e/[code]/assignments/[token]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/tok-ada`,
        ALL_ON,
        { method: "PATCH" },
      ),
      params("tok-ada"),
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 when the body is missing a channel", async () => {
    seedAssignment();

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/tok-ada`,
        { whatsapp: true, signal: false, email: false },
        { method: "PATCH" },
      ),
      params("tok-ada"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid delivery data.",
    });
  });

  it("returns 404 for an unknown token", async () => {
    seedAssignment();

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/missing`,
        ALL_ON,
        { method: "PATCH" },
      ),
      params("missing"),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Assignment not found.",
    });
  });

  it("returns 404 when the assignment belongs to another event", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 2, eventId: 2 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 2,
        drawId: 2,
        revealToken: "other",
      }),
    ]);

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/other`,
        ALL_ON,
        { method: "PATCH" },
      ),
      params("other"),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Assignment not found.",
    });
  });

  it("writes all four flags and returns them", async () => {
    seedAssignment({
      deliveredWhatsapp: true,
      deliveredManual: false,
    });

    const res = await PATCH(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/tok-ada`,
        {
          whatsapp: false,
          signal: true,
          email: false,
          manual: true,
        },
        { method: "PATCH" },
      ),
      params("tok-ada"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      delivered: {
        whatsapp: false,
        signal: true,
        email: false,
        manual: true,
      },
      emailFailed: false,
      emailFailedReason: null,
    });
    expect(mockDb.rows(schema.assignment)[0]).toMatchObject({
      deliveredWhatsapp: false,
      deliveredSignal: true,
      deliveredEmail: false,
      deliveredManual: true,
    });
  });
});

describe("DELETE /api/e/[code]/assignments/[token]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await DELETE(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/tok-ada`,
        {},
        { method: "DELETE" },
      ),
      params("tok-ada"),
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown token", async () => {
    seedAssignment();

    const res = await DELETE(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/missing`,
        {},
        { method: "DELETE" },
      ),
      params("missing"),
    );

    expect(res.status).toBe(404);
  });

  it("removes one pair and keeps the draw when others remain", async () => {
    mockDb.seed(schema.draw, [makeDraw({ id: 1, eventId: 1 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "tok-ada",
      }),
      makeAssignment({
        id: 2,
        drawId: 1,
        giverId: 2,
        receiverId: 1,
        revealToken: "tok-bea",
      }),
    ]);

    const res = await DELETE(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/tok-ada`,
        {},
        { method: "DELETE" },
      ),
      params("tok-ada"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      drawDeleted: false,
    });
    expect(mockDb.rows(schema.assignment)).toHaveLength(1);
    expect(mockDb.rows(schema.assignment)[0].revealToken).toBe("tok-bea");
    expect(mockDb.rows(schema.draw)).toHaveLength(1);
  });

  it("deletes the draw when the last pair is removed", async () => {
    seedAssignment();

    const res = await DELETE(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/assignments/tok-ada`,
        {},
        { method: "DELETE" },
      ),
      params("tok-ada"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      drawDeleted: true,
    });
    expect(mockDb.rows(schema.assignment)).toHaveLength(0);
    expect(mockDb.rows(schema.draw)).toHaveLength(0);
  });
});
