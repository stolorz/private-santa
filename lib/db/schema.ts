import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { BudgetKind, Currency } from "@/lib/budget";
import type { Gender } from "@/lib/gender";
import type { Language } from "@/lib/language";

const bool = (name: string) => integer(name, { mode: "boolean" });
const ts = (name: string) => integer(name, { mode: "timestamp" });
const id = (name = "id") =>
  integer(name).primaryKey({ autoIncrement: true });

/* ------------------------------------------------------------------ */
/* Better Auth tables (managed by the admin plugin schema)            */
/* These mirror what `@better-auth/cli generate` produces for sqlite. */
/* ------------------------------------------------------------------ */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: bool("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role"),
  banned: bool("banned"),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/* ------------------------------------------------------------------ */
/* App tables                                                          */
/* ------------------------------------------------------------------ */

/** Recurring identity (Xmas, Office). Editions belong to one series. */
export const eventSeries = sqliteTable("event_series", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One dated occurrence of a series. `code` is a unique 6-char id
 * (digits + latin letters) used in URLs; names are not unique.
 * `occursOn` is YYYY-MM-DD. `location` is the place name in every
 * language; `locationGdzie` is the Polish "gdzie?" phrase with its
 * preposition (`w Katowicach`, `u babci`).
 * `allowSelfDraw` and `avoidPastPairings` are the live automatic-exclusion
 * choices; the draw copies them when it runs.
 */
export const event = sqliteTable(
  "event",
  {
    id: id(),
    seriesId: integer("series_id")
      .notNull()
      .references(() => eventSeries.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    nameDe: text("name_de"),
    nameEs: text("name_es"),
    nameJa: text("name_ja"),
    namePl: text("name_pl"),
    nameDopelniacz: text("name_dopelniacz"),
    nameCelownik: text("name_celownik"),
    nameBiernik: text("name_biernik"),
    nameNarzednik: text("name_narzednik"),
    nameMiejscownik: text("name_miejscownik"),
    nameWolacz: text("name_wolacz"),
    occursOn: text("occurs_on").notNull(),
    location: text("location"),
    locationGdzie: text("location_gdzie"),
    budgetKind: text("budget_kind").$type<BudgetKind>(),
    budget: real("budget"),
    currency: text("currency").$type<Currency>().notNull().default("EUR"),
    budgetEur: real("budget_eur"),
    budgetPln: real("budget_pln"),
    budgetJpy: real("budget_jpy"),
    allowSelfDraw: bool("allow_self_draw").notNull().default(false),
    avoidPastPairings: bool("avoid_past_pairings").notNull().default(false),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("event_series_id_idx").on(t.seriesId)],
);

/**
 * A person unique across the app. Name, contact details and login live
 * here. Phone and email may be shared (spouses, children).
 */
export const person = sqliteTable(
  "person",
  {
    id: id(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull().default(""),
    nameDopelniacz: text("name_dopelniacz"),
    nameCelownik: text("name_celownik"),
    nameBiernik: text("name_biernik"),
    nameNarzednik: text("name_narzednik"),
    nameMiejscownik: text("name_miejscownik"),
    nameWolacz: text("name_wolacz"),
    phone: text("phone"),
    email: text("email"),
    language: text("language").$type<Language>().notNull().default("pl"),
    gender: text("gender").$type<Gender>(),
    photo: text("photo"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("person_phone_idx").on(t.phone),
    index("person_email_idx").on(t.email),
    index("person_name_normalized_idx").on(t.nameNormalized),
    uniqueIndex("person_user_unique").on(t.userId),
  ],
);

/** A person's seat in one edition. Wishlist hangs off this row. */
export const guest = sqliteTable(
  "guest",
  {
    id: id(),
    eventId: integer("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    wishlistUpdatedAt: ts("wishlist_updated_at"),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("guest_event_person_unique").on(t.eventId, t.personId),
    index("guest_person_id_idx").on(t.personId),
  ],
);

export type DrawStatus = "completed";

/**
 * The current secret-santa lottery on an edition. Holds budget, delivery
 * channels, solver stats, and the automatic-exclusion copy used for this
 * lottery (`allowSelfDraw`, `avoidPastPairings`). The edition holds the
 * live choice.
 */
export const draw = sqliteTable(
  "draw",
  {
    id: id(),
    eventId: integer("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    budgetKind: text("budget_kind").$type<BudgetKind>(),
    budget: real("budget"),
    currency: text("currency").$type<Currency>(),
    budgetEur: real("budget_eur"),
    budgetPln: real("budget_pln"),
    budgetJpy: real("budget_jpy"),
    deliverWhatsapp: bool("deliver_whatsapp").notNull().default(false),
    deliverSignal: bool("deliver_signal").notNull().default(false),
    deliverEmail: bool("deliver_email").notNull().default(false),
    allowSelfDraw: bool("allow_self_draw").notNull().default(false),
    avoidPastPairings: bool("avoid_past_pairings").notNull().default(false),
    status: text("status").$type<DrawStatus>().notNull().default("completed"),
    executedAt: ts("executed_at"),
    durationMs: integer("duration_ms"),
    attempts: integer("attempts"),
    historyLayers: integer("history_layers"),
    layersDropped: integer("layers_dropped"),
    relaxedRestrictions: bool("relaxed_restrictions").notNull().default(false),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("draw_event_created_idx").on(t.eventId, t.createdAt)],
);

export const assignment = sqliteTable(
  "assignment",
  {
    id: id(),
    drawId: integer("draw_id")
      .notNull()
      .references(() => draw.id, { onDelete: "cascade" }),
    giverId: integer("giver_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    receiverId: integer("receiver_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    revealToken: text("reveal_token").notNull().unique(),
    revealCount: integer("reveal_count").notNull().default(0),
    openedAt: ts("opened_at"),
    wishlistSeenAt: ts("wishlist_seen_at"),
    wishlistNotifyClaim: text("wishlist_notify_claim"),
    deliveredWhatsapp: bool("delivered_whatsapp").notNull().default(false),
    deliveredSignal: bool("delivered_signal").notNull().default(false),
    deliveredEmail: bool("delivered_email").notNull().default(false),
    deliveredManual: bool("delivered_manual").notNull().default(false),
    emailFailed: bool("email_failed").notNull().default(false),
    emailFailedReason: text("email_failed_reason"),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("assignment_draw_giver_unique").on(t.drawId, t.giverId),
    uniqueIndex("assignment_draw_receiver_unique").on(t.drawId, t.receiverId),
    index("assignment_giver_id_idx").on(t.giverId),
    index("assignment_receiver_id_idx").on(t.receiverId),
  ],
);

export const exclusion = sqliteTable(
  "exclusion",
  {
    id: id(),
    eventId: integer("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    aId: integer("a_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    bId: integer("b_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("exclusion_event_pair_unique").on(t.eventId, t.aId, t.bId),
    index("exclusion_event_id_idx").on(t.eventId),
    index("exclusion_b_id_idx").on(t.bId),
  ],
);

export type InvitationSource = "draw" | "pending" | "resend";
export type InvitationChannel = "whatsapp" | "signal" | "email";
export type InvitationSendStatus = "sent" | "failed" | "skipped";

/** Append-only invitation log. New rows are `"pending"` or `"resend"` from the Delivery tab; `"draw"` remains only on older rows. */
export const invitationSend = sqliteTable(
  "invitation_send",
  {
    id: id(),
    drawId: integer("draw_id")
      .notNull()
      .references(() => draw.id, { onDelete: "cascade" }),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignment.id, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    source: text("source").$type<InvitationSource>().notNull(),
    channel: text("channel").$type<InvitationChannel>().notNull(),
    status: text("status").$type<InvitationSendStatus>().notNull(),
    error: text("error"),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("invitation_send_draw_idx").on(t.drawId),
    index("invitation_send_assignment_idx").on(t.assignmentId),
    index("invitation_send_batch_idx").on(t.batchId),
  ],
);

export type GuestVisitKind = "opened" | "revealed";

/** Append-only debug log of guest opens and unwraps. */
export const guestActivity = sqliteTable(
  "guest_activity",
  {
    id: id(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignment.id, { onDelete: "cascade" }),
    kind: text("kind").$type<GuestVisitKind>().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    browser: text("browser"),
    os: text("os"),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("guest_activity_assignment_idx").on(t.assignmentId)],
);

export const wishlistItem = sqliteTable(
  "wishlist_item",
  {
    id: id(),
    guestId: integer("guest_id")
      .notNull()
      .references(() => guest.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("wishlist_item_guest_id_idx").on(t.guestId)],
);

export const pushSubscription = sqliteTable(
  "push_subscription",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("push_subscription_user_id_idx").on(t.userId)],
);

export const appSetting = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Per-edition copy of email / Signal / push / reveal templates.
 * Seeded from the previous edition, or from the committed JSON defaults
 * when there is no previous copy. Not in git.
 */
export const eventTemplate = sqliteTable(
  "event_template",
  {
    id: id(),
    eventId: integer("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    language: text("language").notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    uniqueIndex("event_template_event_lang_id_unique").on(
      t.eventId,
      t.language,
      t.templateId,
    ),
    index("event_template_event_id_idx").on(t.eventId),
  ],
);

export type User = typeof user.$inferSelect;
export type EventSeries = typeof eventSeries.$inferSelect;
export type Event = typeof event.$inferSelect;
export type Person = typeof person.$inferSelect;
export type Guest = typeof guest.$inferSelect;
export type Draw = typeof draw.$inferSelect;
export type Assignment = typeof assignment.$inferSelect;
export type InvitationSend = typeof invitationSend.$inferSelect;
export type Exclusion = typeof exclusion.$inferSelect;
export type GuestActivity = typeof guestActivity.$inferSelect;
export type WishlistItem = typeof wishlistItem.$inferSelect;
export type AppSetting = typeof appSetting.$inferSelect;
export type EventTemplate = typeof eventTemplate.$inferSelect;
export type PushSubscription = typeof pushSubscription.$inferSelect;

/** Guest seat with the person's name/phone/email/login resolved. */
export type GuestView = Guest & Omit<Person, "id" | "createdAt">;
