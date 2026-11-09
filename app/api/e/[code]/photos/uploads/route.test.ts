import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeSeries,
} from "@/test/helpers/fixtures";
import { withUploadsDir } from "@/test/helpers/gallery";
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

let uploads: { dir: string; cleanup: () => Promise<void> };

describe("POST /api/e/[code]/photos/uploads", () => {
  beforeEach(async () => {
    await asAdmin();
    uploads = await withUploadsDir();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  afterEach(async () => {
    await uploads.cleanup();
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads`, {
        filename: "a.jpg",
        size: 4,
      }),
      codeParams(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads`, {
        filename: "a.jpg",
      }),
      codeParams(),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid upload." });
  });

  it("starts an upload", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads`, {
        filename: "a.jpg",
        size: 4,
        capturedAt: null,
      }),
      codeParams(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.uploadId).toMatch(/^[a-f0-9]{32}$/);
    expect(body.chunkCount).toBe(1);
  });
});
