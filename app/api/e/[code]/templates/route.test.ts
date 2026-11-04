import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { FIXTURE_EVENT_CODE, makeEvent, makeSeries } from "@/test/helpers/fixtures";
import { codeParams, emptyRequest, jsonRequest } from "@/test/helpers/request";
import { TEMPLATE_DEFAULTS } from "@/lib/templates";

const { getEventTemplates, setEventTemplates } = vi.hoisted(() => ({
  getEventTemplates: vi.fn(),
  setEventTemplates: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/templates/store", () => ({
  getEventTemplates,
  setEventTemplates,
}));

import { GET, PUT } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

describe("/api/e/[code]/templates", () => {
  beforeEach(async () => {
    await asAdmin();
    getEventTemplates.mockReset();
    setEventTemplates.mockReset();
    getEventTemplates.mockResolvedValue(TEMPLATE_DEFAULTS);
    setEventTemplates.mockResolvedValue(TEMPLATE_DEFAULTS);
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/templates`),
      codeParams(),
    );
    expect(res.status).toBe(401);
    expect(getEventTemplates).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown edition", async () => {
    const res = await GET(
      emptyRequest("/api/e/zzzzzz/templates"),
      codeParams("zzzzzz"),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Unknown event." });
    expect(getEventTemplates).not.toHaveBeenCalled();
  });

  it("returns the edition templates", async () => {
    const res = await GET(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/templates`),
      codeParams(),
    );
    expect(res.status).toBe(200);
    expect(getEventTemplates).toHaveBeenCalledWith(1);
    await expect(res.json()).resolves.toEqual(TEMPLATE_DEFAULTS);
  });

  it("saves a language patch on the edition", async () => {
    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/templates`,
        { en: { "email.subject": "Draw {event}" } },
        { method: "PUT" },
      ),
      codeParams(),
    );
    expect(res.status).toBe(200);
    expect(setEventTemplates).toHaveBeenCalledWith(1, {
      en: { "email.subject": "Draw {event}" },
    });
  });

  it("rejects unknown placeholders without writing", async () => {
    const res = await PUT(
      jsonRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/templates`,
        { en: { "email.body": "Hi {givre}!" } },
        { method: "PUT" },
      ),
      codeParams(),
    );
    expect(res.status).toBe(400);
    expect(setEventTemplates).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error:
        "Invalid placeholder in English · Invitation · Body: {givre} is not a known variable.",
    });
  });
});
