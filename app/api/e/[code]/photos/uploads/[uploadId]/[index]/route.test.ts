import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeSeries,
} from "@/test/helpers/fixtures";
import { withUploadsDir } from "@/test/helpers/gallery";
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
import { PUT } from "./route";
import { asAdmin } from "@/test/helpers/session";

let uploads: { dir: string; cleanup: () => Promise<void> };

describe("PUT /api/e/[code]/photos/uploads/[uploadId]/[index]", () => {
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
    const res = await PUT(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads//0`, {
        method: "PUT",
        body: new Uint8Array([1]),
      }),
      codeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid upload id", async () => {
    const res = await PUT(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads/nope/0`, {
        method: "PUT",
        body: new Uint8Array([1, 2, 3, 4]),
      }),
      codeParams(FIXTURE_EVENT_CODE, { uploadId: "nope", index: "0" }),
    );
    expect(res.status).toBe(400);
  });

  it("stores a chunk", async () => {
    const started = await startUpload(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/uploads`, {
        filename: "a.jpg",
        size: 4,
      }),
      codeParams(),
    );
    const { uploadId } = (await started.json()) as { uploadId: string };
    const res = await PUT(
      emptyRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/photos/uploads/${uploadId}/0`,
        {
          method: "PUT",
          body: new Uint8Array([1, 2, 3, 4]),
        },
      ),
      codeParams(FIXTURE_EVENT_CODE, { uploadId, index: "0" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
