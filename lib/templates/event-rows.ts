import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { event, eventTemplate } from "@/lib/db/schema";
import {
  TEMPLATE_IDS,
  TEMPLATE_LANGUAGES,
  templatesViewFromRows,
  type TemplateId,
  type TemplateLanguage,
  type TemplatesView,
} from "@/lib/templates/fields";
import { readReferenceTemplates } from "@/lib/templates/reference";

function insertView(
  handle: DbHandle,
  eventId: number,
  view: TemplatesView,
): void {
  for (const language of TEMPLATE_LANGUAGES) {
    const rows: Array<{
      eventId: number;
      templateId: TemplateId;
      language: TemplateLanguage;
      value: string;
    }> = TEMPLATE_IDS.map((templateId) => ({
      eventId,
      templateId,
      language,
      value: view[language][templateId] ?? "",
    }));
    handle.insert(eventTemplate).values(rows).run();
  }
}

/** Copy the source edition's rows, or snapshot the JSON reference. */
export function copyEventTemplatesOn(
  handle: DbHandle,
  toEventId: number,
  fromEventId?: number | null,
): void {
  if (fromEventId != null) {
    const source = handle
      .select()
      .from(eventTemplate)
      .where(eq(eventTemplate.eventId, fromEventId))
      .all();
    if (source.length > 0) {
      insertView(
        handle,
        toEventId,
        templatesViewFromRows(source, readReferenceTemplates()),
      );
      return;
    }
  }
  insertView(handle, toEventId, readReferenceTemplates());
}

export function loadEventTemplatesOn(
  handle: DbHandle,
  eventId: number,
): TemplatesView {
  const rows = handle
    .select()
    .from(eventTemplate)
    .where(eq(eventTemplate.eventId, eventId))
    .all();
  return templatesViewFromRows(rows, readReferenceTemplates());
}

export function saveEventTemplatesOn(
  handle: DbHandle,
  eventId: number,
  view: TemplatesView,
): void {
  handle.delete(eventTemplate).where(eq(eventTemplate.eventId, eventId)).run();
  insertView(handle, eventId, view);
}

/**
 * Write a full JSON snapshot for every edition that has no rows yet.
 * Safe to run twice. Editions that already have any row are left alone.
 */
export function materializeMissingEventTemplatesOn(
  handle: DbHandle,
  templates: TemplatesView = readReferenceTemplates(),
): number {
  const events = handle.select({ id: event.id }).from(event).all();
  const existing = new Set(
    handle
      .select({ eventId: eventTemplate.eventId })
      .from(eventTemplate)
      .all()
      .map((row) => row.eventId),
  );
  let count = 0;
  for (const row of events) {
    if (existing.has(row.id)) continue;
    insertView(handle, row.id, templates);
    count += 1;
  }
  return count;
}
