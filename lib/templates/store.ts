import "server-only";
import { db } from "@/lib/db";
import {
  applyTemplatesPatch,
  type TemplatesPatch,
  type TemplatesView,
} from "@/lib/templates/fields";
import {
  copyEventTemplatesOn,
  loadEventTemplatesOn,
  materializeMissingEventTemplatesOn,
  saveEventTemplatesOn,
} from "@/lib/templates/event-rows";
import {
  getTemplates,
  readReferenceTemplates,
  resetTemplateDefaultsCache,
  setTemplateDefaultsDir,
  setTemplates,
} from "@/lib/templates/reference";

export {
  getTemplates,
  setTemplates,
  setTemplateDefaultsDir,
  resetTemplateDefaultsCache,
  copyEventTemplatesOn,
  materializeMissingEventTemplatesOn,
};

export async function getEventTemplates(
  eventId: number,
): Promise<TemplatesView> {
  return loadEventTemplatesOn(db, eventId);
}

/** Guest page copy. An invalid link has no edition, so it uses the JSON reference. */
export async function templatesForGuestPage(
  eventId: number | null,
): Promise<TemplatesView> {
  if (eventId == null) return getTemplates();
  return getEventTemplates(eventId);
}

export async function setEventTemplates(
  eventId: number,
  patch: TemplatesPatch,
): Promise<TemplatesView> {
  const next = applyTemplatesPatch(loadEventTemplatesOn(db, eventId), patch);
  db.transaction((tx) => {
    saveEventTemplatesOn(tx, eventId, next);
  });
  return next;
}

export async function materializeMissingEventTemplates(): Promise<number> {
  return materializeMissingEventTemplatesOn(db, readReferenceTemplates());
}
