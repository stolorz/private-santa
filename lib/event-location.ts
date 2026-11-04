/**
 * Where the party is. `location` is the place name, the same in every
 * language (`Katowice`). `locationGdzie` answers the Polish "gdzie?" with
 * its own preposition (`w Katowicach`, `we Wrocławiu`, `u babci`), because
 * the preposition depends on the place and cannot be derived.
 */
export type EventLocationFields = {
  location: string | null;
  locationGdzie: string | null;
};

export const LOCATION_PLACEHOLDERS = ["location", "location_gdzie"] as const;

export type LocationPlaceholder = (typeof LOCATION_PLACEHOLDERS)[number];

export const LOCATION_PLACEHOLDER_LABELS: Record<LocationPlaceholder, string> = {
  location: "Place name (Katowice)",
  location_gdzie: "Place, Polish gdzie? phrase (w Katowicach)",
};

const LOCATION_FIELDS = [
  { field: "location", key: "location", label: "place name" },
  { field: "locationGdzie", key: "location_gdzie", label: "Polish phrase (gdzie?)" },
] as const satisfies ReadonlyArray<{
  field: keyof EventLocationFields;
  key: LocationPlaceholder;
  label: string;
}>;

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function normalizeLocation(
  value: string | null | undefined,
): string | null {
  return trimmed(value) || null;
}

export function eventLocationFrom(
  event: Partial<EventLocationFields> | null | undefined,
): EventLocationFields {
  return {
    location: normalizeLocation(event?.location),
    locationGdzie: normalizeLocation(event?.locationGdzie),
  };
}

/** Labels of the location fields that are blank after trim. */
export function missingEventLocation(
  fields: Partial<EventLocationFields> | null | undefined,
): string[] {
  return LOCATION_FIELDS.filter((spec) => !trimmed(fields?.[spec.field])).map(
    (spec) => spec.label,
  );
}

/** Sentence for an edition save that is missing a location field. */
export function missingEventLocationMessage(
  fields: Partial<EventLocationFields> | null | undefined,
): string | null {
  const missing = missingEventLocation(fields);
  if (missing.length === 0) return null;
  return `Enter the missing location: ${missing.join(", ")}.`;
}

/** Sentence that blocks invitation send until both location fields are set. */
export function missingEventLocationSendReason(
  fields: Partial<EventLocationFields> | null | undefined,
): string | null {
  const missing = missingEventLocation(fields);
  if (missing.length === 0) return null;
  return `Cannot send invitations because the event is missing its location: ${missing.join(", ")}.`;
}

/**
 * `{location}` and `{location_gdzie}`. A blank field returns no key, so the
 * token stays in the copy instead of going blank.
 */
export function locationVars(
  fields: Partial<EventLocationFields> | null | undefined,
): Partial<Record<LocationPlaceholder, string>> {
  const vars: Partial<Record<LocationPlaceholder, string>> = {};
  for (const spec of LOCATION_FIELDS) {
    const value = trimmed(fields?.[spec.field]);
    if (value) vars[spec.key] = value;
  }
  return vars;
}
