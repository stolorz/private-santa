import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeSeries,
} from "@/test/helpers/fixtures";
import { tinyJpeg, withUploadsDir } from "@/test/helpers/gallery";
import { codeParams, emptyRequest, jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

import { POST as startUpload } from "../../route";
import { PUT as putChunk } from "../[index]/route";
import { POST } from "./route";
import { asAdmin } from "@/test/helpers/session";

let uploads: { dir: string; cleanup: () => Promise<void> };

describe("POST /api/e/[code]/photos/uploads/[uploadId]/complete", () => {
  beforeEach(async () => {
    await asAdmin();
    uploads = await withUploadsDir();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  afterEach(async () => {
    await uploads.cleanup();
  });

  it("rejects a missing upload id", async () => {
    const res = await POST(
      emptyRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/photos/uploads//complete`,
        { method: "POST" },
      ),
      codeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid upload id", async () => {
    const res = await POST(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads/nope/complete`, {
        method: "POST",
      }),
      codeParams(FIXTURE_EVENT_CODE, { uploadId: "nope" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates the photo rows", async () => {
    const jpeg = await tinyJpeg();
    const started = await startUpload(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads`, {
        filename: "party.jpg",
        size: jpeg.length,
      }),
      codeParams(),
    );
    const { uploadId } = (await started.json()) as { uploadId: string };
    await putChunk(
      emptyRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/photos/uploads/${uploadId}/0`,
        { method: "PUT", body: new Uint8Array(jpeg) },
      ),
      codeParams(FIXTURE_EVENT_CODE, { uploadId, index: "0" }),
    );
    const res = await POST(
      emptyRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/photos/uploads/${uploadId}/complete`,
        { method: "POST" },
      ),
      codeParams(FIXTURE_EVENT_CODE, { uploadId }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^[a-f0-9]{32}$/);
    expect(mockDb.rows(schema.eventPhoto)).toHaveLength(1);
  });
});
