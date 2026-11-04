import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeEventTemplate,
  makeSeries,
} from "@/test/helpers/fixtures";
import {
  emptyTemplatesView,
  TEMPLATE_DEFAULTS,
  TEMPLATE_IDS,
  TEMPLATE_LANGUAGES,
} from "@/lib/templates/fields";
import { revealCopy } from "@/lib/templates/render";
import { setTemplates } from "@/lib/templates/reference";
import { useTempTemplateDefaults } from "@/test/helpers/template-defaults";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import { db } from "@/lib/db";
import { saveEventTemplatesOn } from "@/lib/templates/event-rows";
import {
  getEventTemplates,
  materializeMissingEventTemplates,
  setEventTemplates,
  templatesForGuestPage,
} from "@/lib/templates/store";

function templateCount(): number {
  return TEMPLATE_LANGUAGES.length * TEMPLATE_IDS.length;
}

describe("event templates", () => {
  beforeEach(() => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns the JSON reference when the edition has no rows", async () => {
    const view = await getEventTemplates(1);
    expect(view.en["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.en["email.subject"],
    );
    expect(mockDb.rows(schema.eventTemplate)).toEqual([]);
  });

  it("overlays stored rows on the JSON reference", async () => {
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "email.subject",
        language: "en",
        value: "Draw {event}",
      }),
    ]);
    const view = await getEventTemplates(1);
    expect(view.en["email.subject"]).toBe("Draw {event}");
    expect(view.pl["email.subject"]).toBe(
      TEMPLATE_DEFAULTS.pl["email.subject"],
    );
  });

  it("stores an empty string when a template id is missing from the view", () => {
    const view = emptyTemplatesView();
    delete (view.en as Record<string, string | undefined>)["email.subject"];
    saveEventTemplatesOn(db, 1, view);
    expect(
      mockDb
        .rows(schema.eventTemplate)
        .find(
          (row) => row.templateId === "email.subject" && row.language === "en",
        )?.value,
    ).toBe("");
  });

  it("stores a full snapshot, including a blank field", async () => {
    await setEventTemplates(1, {
      en: { "email.subject": "Draw {event}", "email.body": "" },
    });
    const rows = mockDb.rows(schema.eventTemplate);
    expect(rows).toHaveLength(templateCount());
    expect(
      rows.find(
        (row) => row.templateId === "email.subject" && row.language === "en",
      )?.value,
    ).toBe("Draw {event}");
    expect(
      rows.find(
        (row) => row.templateId === "email.body" && row.language === "en",
      )?.value,
    ).toBe("");
    const view = await getEventTemplates(1);
    expect(view.en["email.subject"]).toBe("Draw {event}");
    expect(view.en["email.body"]).toBe("");
  });

  it("does not pick up later JSON edits after a snapshot exists", async () => {
    useTempTemplateDefaults();
    await setEventTemplates(1, {
      en: { "email.subject": "Edition subject {event}" },
    });
    await setTemplates({ en: { "email.subject": "New default {event}" } });
    const view = await getEventTemplates(1);
    expect(view.en["email.subject"]).toBe("Edition subject {event}");
    expect(view.pl["email.button"]).toBe(TEMPLATE_DEFAULTS.pl["email.button"]);
  });

  it("uses edition copy on the guest page and the JSON reference for an invalid link", async () => {
    useTempTemplateDefaults();
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "reveal.greeting",
        language: "en",
        value: "Edition hello, {giver}!",
      }),
      makeEventTemplate({
        id: 2,
        templateId: "reveal.not_found_title",
        language: "en",
        value: "Edition missing page",
      }),
    ]);
    await setTemplates({
      en: { "reveal.not_found_title": "Reference missing page" },
    });

    const edition = revealCopy(await templatesForGuestPage(1), "en", {
      giver: "Ada",
    });
    expect(edition.greeting).toBe("Edition hello, Ada!");
    expect(edition.notFoundTitle).toBe("Edition missing page");

    const invalid = revealCopy(await templatesForGuestPage(null), "en");
    expect(invalid.notFoundTitle).toBe("Reference missing page");
    expect(invalid.greeting).toBe(TEMPLATE_DEFAULTS.en["reveal.greeting"]);
  });
});

describe("materializeMissingEventTemplates", () => {
  it("fills only editions with no rows and is safe to run twice", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, code: "second" }),
    ]);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        eventId: 2,
        templateId: "email.subject",
        language: "en",
        value: "Keep me {event}",
      }),
    ]);

    const first = await materializeMissingEventTemplates();
    expect(first).toBe(1);
    expect(
      mockDb.rows(schema.eventTemplate).filter((row) => row.eventId === 1),
    ).toHaveLength(templateCount());
    expect(
      mockDb
        .rows(schema.eventTemplate)
        .find(
          (row) =>
            row.eventId === 2 &&
            row.templateId === "email.subject" &&
            row.language === "en",
        )?.value,
    ).toBe("Keep me {event}");

    const second = await materializeMissingEventTemplates();
    expect(second).toBe(0);
    expect(
      mockDb.rows(schema.eventTemplate).filter((row) => row.eventId === 2),
    ).toHaveLength(1);
  });
});
