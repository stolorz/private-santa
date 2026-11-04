import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
  polishNameCases,
} from "@/test/helpers/fixtures";
import { jsonRequest } from "@/test/helpers/request";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import * as people from "@/lib/people";
import { DELETE, PUT } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putBody(body: Record<string, unknown> = {}) {
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name : "Ada";
  return { gender: "female", ...polishNameCases(name), ...body };
}

describe("PUT /api/people/[id]", () => {
  beforeEach(async () => {
    await asAdmin();
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await PUT(
      jsonRequest("/api/people/1", putBody({ name: "Ada" }), { method: "PUT" }),
      params("1"),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing person", async () => {
    const res = await PUT(
      jsonRequest("/api/people/9", putBody({ name: "Ada" }), { method: "PUT" }),
      params("9"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Person not found." });
  });

  it("updates name, phone and email on the person", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Old", phone: "351911111111" }),
    ]);

    const res = await PUT(
      jsonRequest(
        "/api/people/1",
        putBody({ name: "Ada", phone: "351912345678", email: "Ada@Example.com" }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
    });
  });

  it("returns 404 when the person vanishes during update", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1 })]);
    const spy = vi.spyOn(people, "updatePerson").mockResolvedValue(undefined);
    const res = await PUT(
      jsonRequest("/api/people/1", putBody({ name: "Ada" }), { method: "PUT" }),
      params("1"),
    );
    expect(res.status).toBe(404);
    spy.mockRestore();
  });

  it("refuses to clear a Polish case and leaves the stored value", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", ...polishNameCases("Ada") }),
    ]);

    const res = await PUT(
      jsonRequest(
        "/api/people/1",
        putBody({ nameWolacz: " " }),
        { method: "PUT" },
      ),
      params("1"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Enter the missing Polish cases: Wołacz.",
    });
    expect(mockDb.rows(schema.person)[0]?.nameWolacz).toBe("Ada");
  });

  it("refuses a null or omitted gender", async () => {
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", gender: "male", ...polishNameCases("Ada") }),
    ]);
    const { gender: _gender, ...omitted } = putBody();
    for (const body of [putBody({ gender: null }), omitted]) {
      const res = await PUT(
        jsonRequest("/api/people/1", body, { method: "PUT" }),
        params("1"),
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Gender is required.",
      });
    }
    expect(mockDb.rows(schema.person)[0]?.gender).toBe("male");
  });

  it("updates gender", async () => {
    mockDb.seed(schema.person, [makePerson({ id: 1, gender: null })]);

    const res = await PUT(
      jsonRequest("/api/people/1", putBody({ gender: "female" }), { method: "PUT" }),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ gender: "female" });
  });
});

describe("DELETE /api/people/[id]", () => {
  beforeEach(async () => {
    await asAdmin();
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await DELETE(
      new NextRequest("http://localhost/api/people/1", { method: "DELETE" }),
      params("1"),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing person", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/people/9", { method: "DELETE" }),
      params("9"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Person not found." });
  });

  it("deletes a seated person from every event", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent(), makeEvent({ id: 2 })]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada" }),
      makePerson({ id: 2, name: "Bea" }),
    ]);
    mockDb.seed(schema.guest, [
      makeGuest({ id: 1, eventId: 1, personId: 1 }),
      makeGuest({ id: 2, eventId: 2, personId: 1 }),
      makeGuest({ id: 3, eventId: 1, personId: 2 }),
    ]);

    const res = await DELETE(
      new NextRequest("http://localhost/api/people/1", { method: "DELETE" }),
      params("1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockDb.rows(schema.person).map((p) => p.id)).toEqual([2]);
    expect(mockDb.rows(schema.guest).map((g) => g.id)).toEqual([3]);
  });
});
