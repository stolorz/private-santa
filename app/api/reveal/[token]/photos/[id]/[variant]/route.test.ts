import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeEventPhoto,
  makeEventPhotoVariant,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import { emptyRequest, tokenParams } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

const serveGalleryPhoto = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gallery/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gallery/media")>();
  return { ...actual, serveGalleryPhoto };
});

import { GET } from "./route";

const TOKEN = "guesttokenaa";
const ID = "a".repeat(32);

function seedLink() {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent()]);
  mockDb.seed(schema.draw, [makeDraw()]);
  mockDb.seed(schema.person, [
    makePerson({ id: 1, name: "Ada" }),
    makePerson({ id: 2, name: "Bea" }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 1, personId: 1 }),
    makeGuest({ id: 2, personId: 2 }),
  ]);
  mockDb.seed(schema.assignment, [
    makeAssignment({ revealToken: TOKEN, giverId: 1, receiverId: 2 }),
  ]);
}

describe("GET /api/reveal/[token]/photos/[id]/[variant]", () => {
  beforeEach(() => {
    serveGalleryPhoto.mockReset();
    serveGalleryPhoto.mockResolvedValue(NextResponse.json({ ok: true }));
    seedLink();
  });

  it("returns 404 for an unknown token", async () => {
    const res = await GET(
      emptyRequest(`/api/reveal/nope/photos/${ID}/thumb`),
      tokenParams("nope", { id: ID, variant: "thumb" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "This link is invalid.",
    });
  });

  it("returns 404 when id and variant are missing", async () => {
    const res = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos//`),
      tokenParams(TOKEN),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a bad id or variant", async () => {
    const badId = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/nope/thumb`),
      tokenParams(TOKEN, { id: "nope", variant: "thumb" }),
    );
    expect(badId.status).toBe(404);
    const badKind = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/tiny`),
      tokenParams(TOKEN, { id: ID, variant: "tiny" }),
    );
    expect(badKind.status).toBe(404);
    expect(badKind.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 404 when the photo is not on an allowed edition", async () => {
    const res = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/thumb`),
      tokenParams(TOKEN, { id: ID, variant: "thumb" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the edition has not taken place yet", async () => {
    mockDb.seed(schema.event, [makeEvent({ occursOn: "2099-12-24" })]);
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: ID })]);
    const res = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/thumb`),
      tokenParams(TOKEN, { id: ID, variant: "thumb" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "This link is invalid.",
    });
    expect(serveGalleryPhoto).not.toHaveBeenCalled();
  });

  it("returns 404 until the thumbnail is encoded", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: ID })]);
    const res = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/thumb`),
      tokenParams(TOKEN, { id: ID, variant: "thumb" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "This link is invalid.",
    });
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(serveGalleryPhoto).not.toHaveBeenCalled();
  });

  it("serves a previous-year photo while this year's party is still ahead", async () => {
    const pastId = "b".repeat(32);
    mockDb.seed(schema.event, [
      makeEvent({ occursOn: "2099-12-24", code: "now001" }),
      makeEvent({ id: 2, occursOn: "2025-12-24", code: "past01" }),
    ]);
    mockDb.add(
      schema.guest,
      makeGuest({ id: 10, eventId: 2, personId: 1 }),
      makeGuest({ id: 11, eventId: 2, personId: 2 }),
    );
    mockDb.add(schema.draw, makeDraw({ id: 2, eventId: 2 }));
    mockDb.add(
      schema.assignment,
      makeAssignment({
        id: 2,
        drawId: 2,
        giverId: 10,
        receiverId: 11,
        revealToken: "pasttokenaaa",
      }),
    );
    mockDb.seed(schema.eventPhoto, [
      makeEventPhoto({ id: pastId, eventId: 2 }),
    ]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({ photoId: pastId, status: "done" }),
    ]);
    const res = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${pastId}/thumb`),
      tokenParams(TOKEN, { id: pastId, variant: "thumb" }),
    );
    expect(res.status).toBe(200);
    expect(serveGalleryPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ guest: true, kind: "thumb" }),
    );
  });

  it("serves a photo on the token's edition", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto({ id: ID })]);
    mockDb.seed(schema.eventPhotoVariant, [
      makeEventPhotoVariant({ photoId: ID, status: "done" }),
    ]);
    await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/thumb`),
      tokenParams(TOKEN, { id: ID, variant: "thumb" }),
    );
    expect(serveGalleryPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ guest: true, kind: "thumb" }),
    );
    await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/hd`),
      tokenParams(TOKEN, { id: ID, variant: "hd" }),
    );
    expect(serveGalleryPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ guest: true, kind: "hd" }),
    );
    const res = await GET(
      emptyRequest(`/api/reveal/${TOKEN}/photos/${ID}/original`),
      tokenParams(TOKEN, { id: ID, variant: "original" }),
    );
    expect(res.status).toBe(200);
    expect(serveGalleryPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ guest: true, kind: "original" }),
    );
  });
});
