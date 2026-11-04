import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import { isEmailConfigured, sendEmailBatch } from "@/lib/email";
import { getEventById } from "@/lib/events";
import { isGender } from "@/lib/gender";
import { asNameCases } from "@/lib/name-cases";
import { guestById, guestEmailById } from "@/lib/people";
import { appBaseUrl, guestPortalUrl } from "@/lib/public-path";
import { isSignalConfigured, sendBatch as sendSignalBatch } from "@/lib/signal";
import {
  renderEmail,
  renderTemplate,
  resolveTemplateLanguage,
  WISHLIST_EMAIL_FIELDS,
  WISHLIST_SIGNAL_BODY,
  type EmailFieldIds,
  type TemplateId,
} from "@/lib/templates";
import { getEventTemplates } from "@/lib/templates/store";
import { wishlistNoticeVars } from "@/lib/templates/vars";

export type WishlistChangeKind = "added" | "removed" | "changed";

export type WishlistNoticeClaim = {
  assignmentId: number;
  giverId: number;
  receiverId: number;
  eventId: number;
  revealToken: string;
  token: string;
};

function guestHasGender(
  guest: { gender?: string | null } | undefined,
): boolean {
  return isGender(guest?.gender ?? "");
}

/**
 * Claim a notice if none is in flight, then send on Signal and email.
 * The caller waits for the claim; delivery runs afterwards.
 */
export async function notifyGiverOfWishlistChange(
  guestId: number,
  kind: WishlistChangeKind,
): Promise<void> {
  const claimed = await claimWishlistNotice(guestId);
  if (!claimed) return;
  void deliverWishlistNotice(claimed, kind);
}

export async function claimWishlistNotice(
  guestId: number,
): Promise<WishlistNoticeClaim | null> {
  const receiver = await guestById(guestId);
  if (!receiver) return null;
  const draw = db
    .select()
    .from(schema.draw)
    .where(eq(schema.draw.eventId, receiver.eventId))
    .orderBy(desc(schema.draw.createdAt), desc(schema.draw.id))
    .get();
  if (!draw) return null;
  const assignment = await first(
    db
      .select()
      .from(schema.assignment)
      .where(
        and(
          eq(schema.assignment.drawId, draw.id),
          eq(schema.assignment.receiverId, guestId),
        ),
      ),
  );
  if (!assignment) return null;
  if (assignment.giverId === assignment.receiverId) return null;
  if (!guestHasGender(receiver)) return null;
  const giver = await guestById(assignment.giverId);
  if (!guestHasGender(giver)) return null;

  const token = randomUUID();
  const [updated] = await db
    .update(schema.assignment)
    .set({ wishlistNotifyClaim: token })
    .where(
      and(
        eq(schema.assignment.id, assignment.id),
        isNull(schema.assignment.wishlistNotifyClaim),
      ),
    )
    .returning();
  if (!updated) return null;
  return {
    assignmentId: updated.id,
    giverId: updated.giverId,
    receiverId: receiver.id,
    eventId: receiver.eventId,
    revealToken: updated.revealToken,
    token,
  };
}

export async function deliverWishlistNotice(
  claimed: WishlistNoticeClaim,
  kind: WishlistChangeKind,
): Promise<void> {
  let delivered = false;
  try {
    delivered = await sendWishlistNotice(claimed, kind);
  } catch {
    delivered = false;
  }
  if (delivered) return;
  await releaseWishlistNoticeClaim(claimed.assignmentId, claimed.token);
}

export async function releaseWishlistNoticeClaim(
  assignmentId: number,
  token: string,
): Promise<void> {
  await db
    .update(schema.assignment)
    .set({ wishlistNotifyClaim: null })
    .where(
      and(
        eq(schema.assignment.id, assignmentId),
        eq(schema.assignment.wishlistNotifyClaim, token),
      ),
    );
}

async function sendWishlistNotice(
  claimed: WishlistNoticeClaim,
  kind: WishlistChangeKind,
): Promise<boolean> {
  const [giver, receiver, event, templates, signalOn, emailOn] =
    await Promise.all([
      guestById(claimed.giverId),
      guestById(claimed.receiverId),
      getEventById(claimed.eventId),
      getEventTemplates(claimed.eventId),
      isSignalConfigured(),
      isEmailConfigured(),
    ]);
  if (!giver || !event) return false;
  if (!guestHasGender(giver) || !guestHasGender(receiver)) return false;

  const language = resolveTemplateLanguage(giver.language);
  const url = guestPortalUrl(appBaseUrl(), claimed.revealToken);
  const vars = wishlistNoticeVars(language, asNameCases(giver), event, url);
  const emails = await guestEmailById([giver]);
  const emailAddress = emails.get(giver.id) ?? null;

  const tasks: Array<Promise<boolean>> = [];

  if (signalOn && giver.phone) {
    const bodyId = WISHLIST_SIGNAL_BODY[kind];
    if (templates[language][bodyId].trim() !== "") {
      const text = renderTemplate(templates, bodyId, language, vars);
      tasks.push(
        sendSignalBatch([
          {
            to: giver.phone,
            giverName: giver.name,
            secondParam: url,
            text,
          },
        ]).then((results) => results[0]?.ok === true),
      );
    }
  }

  const emailFields = WISHLIST_EMAIL_FIELDS[kind];
  if (emailOn && emailAddress && emailTemplateReady(templates[language], emailFields)) {
    const rendered = renderEmail(templates, language, vars, {
      fields: emailFields,
    });
    tasks.push(
      sendEmailBatch([
        {
          to: emailAddress,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          revealToken: claimed.revealToken,
        },
      ]).then((results) => results[0]?.ok === true),
    );
  }

  if (tasks.length === 0) return false;
  const results = await Promise.all(tasks);
  return results.some(Boolean);
}

function emailTemplateReady(
  pack: Record<TemplateId, string>,
  fields: EmailFieldIds,
): boolean {
  return (
    pack[fields.subject].trim() !== "" &&
    pack[fields.body].trim() !== "" &&
    pack[fields.button].trim() !== ""
  );
}
