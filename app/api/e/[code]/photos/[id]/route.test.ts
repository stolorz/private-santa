import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeEventPhoto,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams, emptyRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { DELETE } from "./route";
import { asAdmin } from "@/test/helpers/session";

const ID = "a".repeat(32);

describe("DELETE /api/e/[code]/photos/[id]", () => {
  beforeEach(async () => {
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("rejects a missing id", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/`, {
        method: "DELETE",
      }),
      codeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid id", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/nope`, {
        method: "DELETE",
      }),
      codeParams(FIXTURE_EVENT_CODE, { id: "nope" }),
    );
    expect(res.status).toBe(400);
  });

  it("deletes a photo", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: ID })]);
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/${ID}`, {
        method: "DELETE",
      }),
      codeParams(FIXTURE_EVENT_CODE, { id: ID }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.eventPhoto)).toEqual([]);
  });
});
