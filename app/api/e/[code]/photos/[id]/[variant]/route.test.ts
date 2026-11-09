import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
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

const serveGalleryPhoto = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gallery/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gallery/media")>();
  return { ...actual, serveGalleryPhoto };
});

import { GET } from "./route";
import { asAdmin } from "@/test/helpers/session";

const ID = "a".repeat(32);

describe("GET /api/e/[code]/photos/[id]/[variant]", () => {
  beforeEach(async () => {
    await asAdmin();
    serveGalleryPhoto.mockReset();
    serveGalleryPhoto.mockResolvedValue(NextResponse.json({ ok: true }));
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("rejects missing params", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos//`),
      codeParams(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a bad id or variant", async () => {
    const badId = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/nope/thumb`),
      codeParams(FIXTURE_EVENT_CODE, { id: "nope", variant: "thumb" }),
    );
    expect(badId.status).toBe(400);
    const badKind = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/${ID}/tiny`),
      codeParams(FIXTURE_EVENT_CODE, { id: ID, variant: "tiny" }),
    );
    expect(badKind.status).toBe(400);
  });

  it("returns 404 when the photo is not on this edition", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/${ID}/thumb`),
      codeParams(FIXTURE_EVENT_CODE, { id: ID, variant: "thumb" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Unknown photo." });
  });

  it("serves a variant and the original", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: ID, eventId: 1 })]);
    const thumb = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/${ID}/thumb`),
      codeParams(FIXTURE_EVENT_CODE, { id: ID, variant: "thumb" }),
    );
    expect(thumb.status).toBe(200);
    expect(serveGalleryPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ guest: false, kind: "thumb" }),
    );
    await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/photos/${ID}/original`),
      codeParams(FIXTURE_EVENT_CODE, { id: ID, variant: "original" }),
    );
    expect(serveGalleryPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "original", variantReady: true }),
    );
  });
});
