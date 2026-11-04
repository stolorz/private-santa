import "server-only";
import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getEventById } from "@/lib/events";
import { getPushConfig, isPushComplete } from "@/lib/integrations";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import { apiPath } from "@/lib/public-path";
import { renderTemplate, type TemplateId } from "@/lib/templates";
import { getEventTemplates } from "@/lib/templates/store";
import { dateVars } from "@/lib/event-date";
import { eventNameFieldsFrom, eventVars } from "@/lib/event-name";
import { nameVars, type NameCases } from "@/lib/name-cases";

/** Organiser-only Web Push when VAPID keys and a subject are saved. */

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

let vapid: { pub: string; priv: string; subject: string } | null = null;

async function configuredVapid(): Promise<boolean> {
  const cfg = await getPushConfig();
  if (!isPushComplete(cfg)) return false;
  if (
    vapid?.pub !== cfg.publicKey ||
    vapid?.priv !== cfg.privateKey ||
    vapid?.subject !== cfg.subject
  ) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    vapid = {
      pub: cfg.publicKey,
      priv: cfg.privateKey,
      subject: cfg.subject,
    };
  }
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  test?: boolean;
}

export type GuestActivityKind =
  | "opened"
  | "revealed"
  | "wishlist_added"
  | "wishlist_read";

const GUEST_ACTIVITY_TEMPLATES: Record<
  GuestActivityKind,
  { title: TemplateId; body: TemplateId }
> = {
  opened: { title: "push.opened.title", body: "push.opened.body" },
  revealed: { title: "push.revealed.title", body: "push.revealed.body" },
  wishlist_added: {
    title: "push.wishlist_added.title",
    body: "push.wishlist_added.body",
  },
  wishlist_read: {
    title: "push.wishlist_read.title",
    body: "push.wishlist_read.body",
  },
};

export const PUSH_TEST_TITLE = "Secret Santa";
export const PUSH_TEST_BODY =
  "Secret Santa test: Web Push is configured and sending.";

async function deliverToSubscriptions(
  subs: (typeof schema.pushSubscription.$inferSelect)[],
  payload: PushPayload,
  options?: webpush.RequestOptions,
) {
  const data = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const dead: number[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        const subscription = {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        };
        if (options) {
          await webpush.sendNotification(subscription, data, options);
        } else {
          await webpush.sendNotification(subscription, data);
        }
        sent++;
      } catch (e) {
        failed++;
        const status =
          e &&
          typeof e === "object" &&
          "statusCode" in e &&
          typeof e.statusCode === "number"
            ? e.statusCode
            : undefined;
        if (status === 404 || status === 410) dead.push(s.id);
      }
    }),
  );

  if (dead.length > 0) {
    await db
      .delete(schema.pushSubscription)
      .where(inArray(schema.pushSubscription.id, dead));
  }

  return { sent, failed };
}

async function deliverToUserIds(userIds: string[], payload: PushPayload) {
  const subs = await db
    .select()
    .from(schema.pushSubscription)
    .where(inArray(schema.pushSubscription.userId, userIds));
  return deliverToSubscriptions(subs, payload);
}

export async function pushToAdmins(payload: PushPayload) {
  const admins = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"));
  const userIds = admins.map((row) => row.id);
  if (userIds.length === 0 || !(await configuredVapid())) {
    return { sent: 0, failed: 0 };
  }
  return deliverToUserIds(userIds, payload);
}

/** Send a test notification to one stored subscription on this organiser. */
export async function sendPushTest(userId: string, endpoint: string) {
  if (!(await configuredVapid())) {
    return { sent: 0, failed: 0 };
  }
  const subs = await db
    .select()
    .from(schema.pushSubscription)
    .where(
      and(
        eq(schema.pushSubscription.userId, userId),
        eq(schema.pushSubscription.endpoint, endpoint),
      ),
    );
  return deliverToSubscriptions(
    subs,
    {
      title: PUSH_TEST_TITLE,
      body: PUSH_TEST_BODY,
      url: apiPath("/settings"),
      test: true,
    },
    { TTL: 60, urgency: "high" },
  );
}

/** Failures are logged; callers should not await this on guest-facing routes. */
export async function notifyAdminsOfGuestActivity(input: {
  kind: GuestActivityKind;
  giver: NameCases;
  eventId: number;
}): Promise<void> {
  try {
    const [event, templates] = await Promise.all([
      getEventById(input.eventId),
      getEventTemplates(input.eventId),
    ]);
    const vars = {
      ...nameVars("giver", input.giver),
      ...eventVars(eventNameFieldsFrom(event), DEFAULT_LANGUAGE),
      ...dateVars(event?.occursOn, DEFAULT_LANGUAGE),
    };
    const ids = GUEST_ACTIVITY_TEMPLATES[input.kind];
    await pushToAdmins({
      title: renderTemplate(templates, ids.title, DEFAULT_LANGUAGE, vars),
      body: renderTemplate(templates, ids.body, DEFAULT_LANGUAGE, vars),
      url: event
        ? apiPath(`/e/${encodeURIComponent(event.code)}/admin`)
        : apiPath("/events"),
    });
  } catch (err) {
    console.error("Admin push failed", err);
  }
}
