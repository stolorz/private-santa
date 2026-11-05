import type {
  AppSetting,
  Assignment,
  Draw,
  Event,
  EventSeries,
  EventTemplate,
  Exclusion,
  Guest,
  GuestActivity,
  GuestView,
  InvitationSend,
  Person,
  PushSubscription,
  User,
  WishlistItem,
} from "@/lib/db/schema";
import { normalizeName } from "@/lib/person-name";

/** Stable timestamp so fixture graphs compare cleanly across tests. */
export const FIXTURE_NOW = new Date("2026-01-01T00:00:00.000Z");
export const FIXTURE_OCCURS_ON = "2026-01-01";
export const FIXTURE_EVENT_CODE = "xmas_20260101";

export function makeUser(overrides: Partial<User> = {}): User {
  const id = overrides.id ?? "user_1";
  return {
    id,
    name: "Test User",
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    role: "user",
    banned: null,
    banReason: null,
    banExpires: null,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeSeries(overrides: Partial<EventSeries> = {}): EventSeries {
  const id = overrides.id ?? 1;
  return {
    id,
    name: id === 1 ? "Xmas" : `Series ${id}`,
    slug: id === 1 ? "xmas" : `series-${id}`,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  const id = overrides.id ?? 1;
  const seriesId = overrides.seriesId ?? 1;
  return {
    id,
    seriesId,
    code: id === 1 ? FIXTURE_EVENT_CODE : `event_${id}_20260101`,
    name: id === 1 ? "Xmas" : `Event ${id}`,
    nameEn: null,
    nameDe: null,
    nameEs: null,
    nameJa: null,
    namePl: null,
    nameDopelniacz: null,
    nameCelownik: null,
    nameBiernik: null,
    nameNarzednik: null,
    nameMiejscownik: null,
    nameWolacz: null,
    occursOn: FIXTURE_OCCURS_ON,
    location: null,
    locationGdzie: null,
    budgetKind: null,
    budget: null,
    currency: "EUR",
    budgetEur: null,
    budgetPln: null,
    budgetJpy: null,
    allowSelfDraw: false,
    avoidPastPairings: false,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

/** Place name and Polish "gdzie?" phrase for sends that require them. */
export function eventLocation() {
  return {
    location: "Katowice",
    locationGdzie: "w Katowicach",
  };
}

/** All six Polish cases set to `name`, for saves that require them. */
export function polishNameCases(name: string) {
  return {
    nameDopelniacz: name,
    nameCelownik: name,
    nameBiernik: name,
    nameNarzednik: name,
    nameMiejscownik: name,
    nameWolacz: name,
  };
}

/** Polish, German, Spanish, and Japanese titles for saves and sends that require them. */
export function eventNameTranslations() {
  return {
    namePl: "Święta",
    nameDe: "Weihnachten",
    nameEs: "Navidad",
    nameJa: "クリスマス",
  };
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  const id = overrides.id ?? 1;
  const name = overrides.name ?? `Person ${id}`;
  const person: Person = {
    id,
    name,
    nameNormalized: normalizeName(name),
    nameDopelniacz: null,
    nameCelownik: null,
    nameBiernik: null,
    nameNarzednik: null,
    nameMiejscownik: null,
    nameWolacz: null,
    phone: null,
    email: null,
    language: "en",
    gender: null,
    photo: null,
    userId: null,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
  if (overrides.nameNormalized === undefined) {
    person.nameNormalized = normalizeName(person.name);
  }
  return person;
}

export function makeGuest(overrides: Partial<Guest> = {}): Guest {
  const id = overrides.id ?? 1;
  return {
    id,
    eventId: 1,
    personId: id,
    wishlistUpdatedAt: null,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeGuestView(
  overrides: Partial<GuestView> = {},
): GuestView {
  const guest = makeGuest(overrides);
  return {
    ...guest,
    name: overrides.name ?? `Person ${guest.id}`,
    nameDopelniacz: overrides.nameDopelniacz ?? null,
    nameCelownik: overrides.nameCelownik ?? null,
    nameBiernik: overrides.nameBiernik ?? null,
    nameNarzednik: overrides.nameNarzednik ?? null,
    nameMiejscownik: overrides.nameMiejscownik ?? null,
    nameWolacz: overrides.nameWolacz ?? null,
    phone: overrides.phone ?? null,
    email: overrides.email ?? null,
    userId: overrides.userId ?? null,
    language: overrides.language ?? "en",
    gender: overrides.gender ?? null,
    photo: overrides.photo ?? null,
    nameNormalized:
      overrides.nameNormalized ??
      normalizeName(overrides.name ?? `Person ${guest.id}`),
    ...overrides,
  };
}

/** Person + matching guest seat with the same id (common test graph). */
export function makeSeat(
  overrides: Partial<Person> & { eventId?: number; guestId?: number } = {},
): { person: Person; guest: Guest } {
  const personId = overrides.id ?? 1;
  const { eventId, guestId, ...personOverrides } = overrides;
  const person = makePerson({ id: personId, ...personOverrides });
  const guest = makeGuest({
    id: guestId ?? personId,
    eventId: eventId ?? 1,
    personId,
  });
  return { person, guest };
}

export function makeDraw(overrides: Partial<Draw> = {}): Draw {
  const id = overrides.id ?? 1;
  return {
    id,
    eventId: 1,
    name: "Test Draw",
    budgetKind: null,
    budget: null,
    currency: null,
    budgetEur: null,
    budgetPln: null,
    budgetJpy: null,
    deliverWhatsapp: false,
    deliverSignal: false,
    deliverEmail: false,
    allowSelfDraw: false,
    avoidPastPairings: false,
    status: "completed",
    executedAt: null,
    durationMs: null,
    attempts: null,
    historyLayers: null,
    layersDropped: null,
    relaxedRestrictions: false,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeAssignment(
  overrides: Partial<Assignment> = {},
): Assignment {
  const id = overrides.id ?? 1;
  return {
    id,
    drawId: 1,
    giverId: 1,
    receiverId: 2,
    revealToken: `token-${id}`,
    revealCount: 0,
    openedAt: null,
    wishlistSeenAt: null,
    wishlistNotifyClaim: null,
    deliveredWhatsapp: false,
    deliveredSignal: false,
    deliveredEmail: false,
    deliveredManual: false,
    emailFailed: false,
    emailFailedReason: null,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeInvitationSend(
  overrides: Partial<InvitationSend> = {},
): InvitationSend {
  const id = overrides.id ?? 1;
  return {
    id,
    drawId: 1,
    assignmentId: 1,
    batchId: "batch-1",
    source: "draw",
    channel: "email",
    status: "sent",
    error: null,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeExclusion(overrides: Partial<Exclusion> = {}): Exclusion {
  const id = overrides.id ?? 1;
  return {
    id,
    eventId: 1,
    aId: 1,
    bId: 2,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeGuestActivity(
  overrides: Partial<GuestActivity> = {},
): GuestActivity {
  const id = overrides.id ?? 1;
  return {
    id,
    assignmentId: 1,
    kind: "opened",
    ip: null,
    userAgent: null,
    browser: null,
    os: null,
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeWishlistItem(
  overrides: Partial<WishlistItem> = {},
): WishlistItem {
  const id = overrides.id ?? 1;
  return {
    id,
    guestId: 1,
    text: "A gift idea",
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makePushSubscription(
  overrides: Partial<PushSubscription> = {},
): PushSubscription {
  const id = overrides.id ?? 1;
  return {
    id,
    userId: "user_1",
    endpoint: `https://push.example/${id}`,
    p256dh: "p256dh-key",
    auth: "auth-key",
    createdAt: FIXTURE_NOW,
    ...overrides,
  };
}

export function makeEventTemplate(
  overrides: Partial<EventTemplate> = {},
): EventTemplate {
  return {
    id: 1,
    eventId: 1,
    templateId: "email.subject",
    language: "en",
    value: "Custom {event}",
    ...overrides,
  };
}

export function makeAppSetting(overrides: Partial<AppSetting> = {}): AppSetting {
  return {
    key: "og.title",
    value: "Private Santa",
    updatedAt: FIXTURE_NOW,
    ...overrides,
  };
}

/** Non-empty KV rows for `app_setting`. Blank values are omitted. */
export function makeSettingRows(entries: Record<string, string>): AppSetting[] {
  return Object.entries(entries)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => makeAppSetting({ key, value }));
}
