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

import { GET } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

describe("GET /api/e/[code]/photos", () => {
  beforeEach(async () => {
    vi.stubEnv("PHOTO_WORKER_HEARTBEAT", "data/missing-photo-worker.heartbeat");
    await asAdmin();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos`),
      codeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("returns the photo list and worker flag", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto()]);
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photos).toHaveLength(1);
    expect(body.workerAlive).toBe(false);
  });
});
