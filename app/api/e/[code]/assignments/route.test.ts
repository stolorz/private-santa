import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { codeParams, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


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

describe("POST /api/e/[code]/assignments", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://santa.test");
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 2,
      }),
      codeParams(),
    );

    expect(res.status).toBe(401);
  });

  it("creates a draw and assignment when none exist", async () => {
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 2,
      }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignment).toMatchObject({
      giverId: 1,
      receiverId: 2,
    });
    expect(body.assignment.revealToken).toMatch(/^[0-9a-z]{6}$/);
    expect(body.revealLink.giver).toBe("Ada");
    expect(body.revealLink.token).toBe(body.assignment.revealToken);
    expect(mockDb.rows(schema.draw)).toHaveLength(1);
    expect(mockDb.rows(schema.draw)[0]).toMatchObject({
      status: "completed",
      name: "Xmas",
    });
    expect(mockDb.rows(schema.assignment)).toHaveLength(1);
  });

  it("appends a pair onto the current draw", async () => {
    seedTwoGuests();
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
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        id: 1,
        drawId: 1,
        giverId: 1,
        receiverId: 2,
        revealToken: "tokada",
      }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 3,
        receiverId: 4,
      }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    expect(mockDb.rows(schema.draw)).toHaveLength(1);
    expect(mockDb.rows(schema.assignment)).toHaveLength(2);
    expect(
      mockDb.rows(schema.assignment).map((a) => a.giverId).sort(),
    ).toEqual([1, 3]);
  });

  it("rejects a giver who already has a match", async () => {
    seedTwoGuests();
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 1, receiverId: 2 }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 1,
      }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That guest already has someone to give to.",
    });
  });

  it("rejects a receiver who is already receiving", async () => {
    seedTwoGuests();
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
      makePerson({ id: 3, name: "Cal" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, personId: 1 }),
      makeGuest({ id: 2, personId: 2 }),
      makeGuest({ id: 3, personId: 3 }),
    ]);
    mockDb.seed(schema.draw, [makeDraw({ id: 1, status: "completed" })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({ id: 1, drawId: 1, giverId: 1, receiverId: 2 }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 3,
        receiverId: 2,
      }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That guest is already receiving a gift.",
    });
  });

  it("rejects an excluded pair", async () => {
    seedTwoGuests();
    mockDb.seed(schema.exclusion, [makeExclusion({ aId: 1, bId: 2 })]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 2,
      }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That pair is excluded.",
    });
  });

  it("rejects a self-pair when self-draw is off", async () => {
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 1,
      }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Self-draw is not allowed.",
    });
  });

  it("allows a self-pair when self-draw is on", async () => {
    mockDb.seed(schema.event, [makeEvent({ allowSelfDraw: true })]);
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 1,
      }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.assignment).toMatchObject({ giverId: 1, receiverId: 1 });
    expect(mockDb.rows(schema.draw)[0].allowSelfDraw).toBe(true);
  });

  it("copies edition avoidPastPairings onto a new draw", async () => {
    mockDb.seed(schema.event, [
      makeEvent({ avoidPastPairings: true }),
      makeEvent({ id: 2, occursOn: "2025-01-01", code: "older1" }),
    ]);
    seedTwoGuests();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 2,
        avoidPastPairings: false,
      }),
      codeParams(),
    );

    expect(res.status).toBe(201);
    expect(mockDb.rows(schema.draw)[0].avoidPastPairings).toBe(true);
  });

  it("rejects guests from another edition", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 2 }),
    ]);

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/assignments`, {
        giverId: 1,
        receiverId: 2,
      }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Both people must belong to this edition.",
    });
  });
});
