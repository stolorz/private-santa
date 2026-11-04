import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRequest, jsonRequest } from "@/test/helpers/request";
import { TEMPLATE_DEFAULTS } from "@/lib/templates";

const { getTemplates, setTemplates } = vi.hoisted(() => ({
  getTemplates: vi.fn(),
  setTemplates: vi.fn(),
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
  getTemplates,
  setTemplates,
}));

import { GET, PUT } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


describe("/api/settings/templates", () => {
  beforeEach(async () => {
    await asAdmin();
    getTemplates.mockReset();
    setTemplates.mockReset();
    getTemplates.mockResolvedValue(TEMPLATE_DEFAULTS);
    setTemplates.mockResolvedValue(TEMPLATE_DEFAULTS);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await GET(emptyRequest("/api/settings/templates"));

    expect(res.status).toBe(401);
    expect(getTemplates).not.toHaveBeenCalled();
  });

  it("returns the current templates", async () => {
    const res = await GET(emptyRequest("/api/settings/templates"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(TEMPLATE_DEFAULTS);
  });

  it("saves a language patch", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        { en: { "email.subject": "Draw {event}" } },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(200);
    expect(setTemplates).toHaveBeenCalledWith({
      en: { "email.subject": "Draw {event}" },
    });
    await expect(res.json()).resolves.toEqual(TEMPLATE_DEFAULTS);
  });

  it("saves German, Spanish, and Japanese patches", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        {
          de: { "email.subject": "Los {event}" },
          es: { "email.button": "Ver pareja" },
          ja: { "reveal.greeting": "こんにちは、{giver}" },
        },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(200);
    expect(setTemplates).toHaveBeenCalledWith({
      de: { "email.subject": "Los {event}" },
      es: { "email.button": "Ver pareja" },
      ja: { "reveal.greeting": "こんにちは、{giver}" },
    });
  });

  it("rejects unknown placeholders", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        { en: { "email.body": "Hi {givre}!" } },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(400);
    expect(setTemplates).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error:
        "Invalid placeholder in English · Invitation · Body: {givre} is not a known variable.",
    });
  });

  it("saves a valid gender select", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        {
          en: {
            "email.body":
              "{giver_gender|female:Hi|male:Hey} {giver} {url}",
          },
        },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(200);
    expect(setTemplates).toHaveBeenCalledWith({
      en: {
        "email.body":
          "{giver_gender|female:Hi|male:Hey} {giver} {url}",
      },
    });
  });

  it("rejects a gender select with a fallback or trailing pipe", async () => {
    for (const body of [
      "{giver_gender|female:Hi|male:Hey|Hello} {giver} {url}",
      "{giver_gender|female:Hi|male:Hey|} {giver} {url}",
    ]) {
      setTemplates.mockClear();
      const res = await PUT(
        jsonRequest(
          "/api/settings/templates",
          { en: { "email.body": body } },
          { method: "PUT" },
        ),
      );

      expect(res.status).toBe(400);
      expect(setTemplates).not.toHaveBeenCalled();
      await expect(res.json()).resolves.toMatchObject({
        error: expect.stringMatching(
          /cannot use the fallback|has a trailing \|/,
        ),
      });
    }
  });

  it("rejects an unknown gender branch", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        {
          en: {
            "email.body": "{giver_gender|fmale:Droga|male:Drogi} {url}",
          },
        },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(400);
    expect(setTemplates).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error:
        "Invalid placeholder in English · Invitation · Body: fmale is not a valid choice. Use female or male.",
    });
  });

  it("rejects a gender select on a non-gender placeholder", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        { en: { "email.body": "{event|female:Office|male:Shop}" } },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(400);
    expect(setTemplates).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error:
        "Invalid placeholder in English · Invitation · Body: {event} cannot use | choices.",
    });
  });

  it("rejects a duplicate gender branch", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        {
          pl: {
            "email.body":
              "{giver_gender|female:Droga|female:Kochana} {url}",
          },
        },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(400);
    expect(setTemplates).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error:
        "Invalid placeholder in Polish · Invitation · Body: female is listed twice.",
    });
  });

  it("rejects unknown template ids", async () => {
    const res = await PUT(
      jsonRequest(
        "/api/settings/templates",
        { en: { "email.unknown": "nope" } },
        { method: "PUT" },
      ),
    );

    expect(res.status).toBe(400);
    expect(setTemplates).not.toHaveBeenCalled();
  });
});
