import "server-only";
import { eq } from "drizzle-orm";
import { effectiveBudgetKind } from "@/lib/budget";
import { db, schema, type DbHandle } from "@/lib/db";
import type { Assignment, Draw, Event, GuestView } from "@/lib/db/schema";
import { unconfiguredDeliveryError } from "@/lib/delivery";
import { DrawError, hasPastPairing, leftoverIds, runDraw } from "@/lib/draw";
import { pastPairingLayers } from "@/lib/draw-history";
import { allocateUniqueRevealToken } from "@/lib/event-code";
import { listExclusionsOn } from "@/lib/exclusion-store";
import { hasExclusionPair } from "@/lib/exclusions";
import { getEventById, hasEarlierEdition } from "@/lib/events";
import {
  assignmentsForDraw,
  latestDrawForEvent,
  latestDrawOn,
  revealLinksFor,
  updateDrawChannels,
} from "@/lib/pairings";
import { guestsBelongToEvent, guestsForEvent } from "@/lib/people";
import { mustExist } from "@/lib/utils";

export interface ExecuteResult {
  draw: Draw;
  assignments: number;
}

export type DrawContext = {
  event: Event;
  draw: Draw;
  guests: GuestView[];
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  );
}

function rethrowDrawConflict(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new DrawError("Draw changed, retry.");
  }
  throw error;
}

function persistDrawSolution(tx: DbHandle, ctx: DrawContext): Draw {
  const { event, draw, guests } = ctx;
  const existing = assignmentsForDraw(draw.id, tx);
  const leftover = leftoverIds(
    guests.map((g) => g.id),
    existing,
  );

  if (leftover.givers.length === 0) {
    throw new DrawError(
      guests.length === 0
        ? "Need at least 2 participants to run a draw."
        : "Everyone already has someone to give to.",
    );
  }
  if (leftover.givers.length !== leftover.receivers.length) {
    throw new DrawError(
      "Assignment slots are inconsistent — remove a pair and try again.",
    );
  }

  const exclusions = listExclusionsOn(draw.eventId, tx);
  const history = draw.avoidPastPairings
    ? pastPairingLayers(tx, event, draw.id)
    : [];

  const leftoverSamePool = leftover.givers.every(
    (id, i) => id === leftover.receivers[i],
  );
  const result = runDraw(
    leftover.givers,
    exclusions.map((e) => [e.aId, e.bId] as [number, number]),
    history,
    {
      allowSelfDraw: draw.allowSelfDraw,
      ...(leftoverSamePool ? {} : { receivers: leftover.receivers }),
    },
  );

  const usedTokens = new Set(existing.map((a) => a.revealToken));
  const rows = [...result.pairs.entries()].map(([giverId, receiverId]) => ({
    drawId: draw.id,
    giverId,
    receiverId,
    revealToken: allocateUniqueRevealToken(usedTokens),
  }));

  tx.insert(schema.assignment).values(rows).returning().all();
  const [updated] = tx
    .update(schema.draw)
    .set({
      status: "completed",
      executedAt: new Date(),
      durationMs: result.durationMs,
      attempts: result.attempts,
      historyLayers: history.length,
      layersDropped: result.layersDropped,
      relaxedRestrictions: result.relaxedRestrictions,
    })
    .where(eq(schema.draw.id, draw.id))
    .returning()
    .all();
  return mustExist(updated, "Could not update draw.");
}

function completedDrawResult(draw: Draw): ExecuteResult {
  return {
    draw,
    assignments: assignmentsForDraw(draw.id).length,
  };
}

/**
 * Execute an existing draw: compute leftover assignments, persist new
 * pairings (always with reveal tokens), and mark the draw executed.
 * Existing pairs and tokens are kept. Does not send invitations. Throws
 * {@link DrawError} on infeasible draws.
 */
export async function executeDraw(draw: Draw): Promise<ExecuteResult> {
  const event = await getEventById(draw.eventId);
  if (!event) throw new DrawError("Unknown event.");
  const guests = await guestsForEvent(draw.eventId);
  try {
    const updated = db.transaction((tx) =>
      persistDrawSolution(tx, { event, draw, guests }),
    );
    return completedDrawResult(updated);
  } catch (error) {
    rethrowDrawConflict(error);
  }
}

export type DrawDeliveryFlags = {
  deliverWhatsapp?: boolean;
  deliverSignal?: boolean;
  deliverEmail?: boolean;
};

export async function setDrawDeliveryFlags(
  eventId: number,
  flags: DrawDeliveryFlags,
): Promise<Draw> {
  const err = await unconfiguredDeliveryError(flags);
  if (err) throw new DrawError(err);
  const current = await latestDrawForEvent(eventId);
  if (!current) {
    throw new DrawError("Run the draw before choosing delivery channels.");
  }
  return updateDrawChannels(current.id, {
    whatsapp: flags.deliverWhatsapp,
    signal: flags.deliverSignal,
    email: flags.deliverEmail,
  });
}

export type AutomaticExclusions = {
  allowSelfDraw?: boolean;
  avoidPastPairings?: boolean;
};

/** Live edition choice; also copied onto the current draw when one exists. */
export async function setAutomaticExclusions(
  eventId: number,
  flags: AutomaticExclusions,
): Promise<Draw | null> {
  const event = await getEventById(eventId);
  if (!event) throw new DrawError("Unknown event.");
  const patch = {
    ...(flags.allowSelfDraw != null
      ? { allowSelfDraw: flags.allowSelfDraw }
      : {}),
    ...(flags.avoidPastPairings != null
      ? { avoidPastPairings: flags.avoidPastPairings }
      : {}),
  };
  if (Object.keys(patch).length === 0) {
    return (await latestDrawForEvent(eventId)) ?? null;
  }
  mustExist(
    db
      .update(schema.event)
      .set(patch)
      .where(eq(schema.event.id, eventId))
      .returning()
      .all()[0],
    "Could not update event.",
  );
  const current = await latestDrawForEvent(eventId);
  if (!current) return null;
  return updateDrawChannels(current.id, patch);
}

type DrawInsertExtra = {
  allowSelfDraw: boolean;
  avoidPastPairings: boolean;
  executedAt?: Date;
};

async function solverFlagsForEdition(event: Event): Promise<DrawInsertExtra> {
  const hasPast = await hasEarlierEdition(event.seriesId, event);
  return {
    allowSelfDraw: event.allowSelfDraw,
    avoidPastPairings: event.avoidPastPairings && hasPast,
  };
}

function drawInsertValues(event: Event, extra: DrawInsertExtra) {
  return {
    eventId: event.id,
    name: event.name,
    budgetKind: effectiveBudgetKind(event),
    budget: event.budget ?? null,
    currency: event.currency ?? "EUR",
    budgetEur: event.budgetEur ?? null,
    budgetPln: event.budgetPln ?? null,
    budgetJpy: event.budgetJpy ?? null,
    status: "completed" as const,
    ...extra,
  };
}

function insertDraw(tx: DbHandle, event: Event, extra: DrawInsertExtra): Draw {
  return mustExist(
    tx
      .insert(schema.draw)
      .values(drawInsertValues(event, extra))
      .returning()
      .all()[0],
    "Could not create draw.",
  );
}

export async function startDraw(event: Event): Promise<ExecuteResult> {
  const guests = await guestsForEvent(event.id);
  const current = await latestDrawForEvent(event.id);
  const existingAssignments = current
    ? assignmentsForDraw(current.id)
    : [];
  const leftover = leftoverIds(
    guests.map((g) => g.id),
    existingAssignments,
  );
  const solverFlags = await solverFlagsForEdition(event);

  if (guests.length === 0 || leftover.givers.length === 0) {
    throw new DrawError(
      leftover.givers.length === 0 && guests.length > 0
        ? "Everyone already has someone to give to."
        : "Need at least 2 participants to run a draw.",
    );
  }
  if (
    leftover.givers.length === 1 &&
    leftover.givers[0] === leftover.receivers[0] &&
    !solverFlags.allowSelfDraw
  ) {
    throw new DrawError("Need at least 2 participants to run a draw.");
  }

  try {
    const updated = db.transaction((tx) => {
      const draw = current
        ? mustExist(
            tx
              .update(schema.draw)
              .set(solverFlags)
              .where(eq(schema.draw.id, current.id))
              .returning()
              .all()[0],
            "Could not update draw.",
          )
        : insertDraw(tx, event, solverFlags);
      return persistDrawSolution(tx, { event, draw, guests });
    });
    return completedDrawResult(updated);
  } catch (error) {
    rethrowDrawConflict(error);
  }
}

export async function addManualPair(
  event: Event,
  input: {
    giverId: number;
    receiverId: number;
  },
) {
  const { giverId, receiverId } = input;
  if (!(await guestsBelongToEvent(event.id, [giverId, receiverId]))) {
    throw new DrawError("Both people must belong to this edition.");
  }

  const guests = await guestsForEvent(event.id);
  const solverFlags = await solverFlagsForEdition(event);

  let assignment: Assignment;
  let draw: Draw;
  try {
    ({ assignment, draw } = db.transaction((tx) => {
      const current = latestDrawOn(tx, event.id);
      const existing = current ? assignmentsForDraw(current.id, tx) : [];
      const leftover = leftoverIds(
        guests.map((g) => g.id),
        existing,
      );
      if (!leftover.givers.includes(giverId)) {
        throw new DrawError("That guest already has someone to give to.");
      }
      if (!leftover.receivers.includes(receiverId)) {
        throw new DrawError("That guest is already receiving a gift.");
      }

      if (giverId === receiverId && !event.allowSelfDraw) {
        throw new DrawError("Self-draw is not allowed.");
      }

      const exclusions = listExclusionsOn(event.id, tx);
      if (hasExclusionPair(exclusions, giverId, receiverId)) {
        throw new DrawError("That pair is excluded.");
      }
      if (
        solverFlags.avoidPastPairings &&
        hasPastPairing(
          pastPairingLayers(tx, event).flat(),
          giverId,
          receiverId,
        )
      ) {
        throw new DrawError("That pair was drawn in an earlier edition.");
      }

      const draw = current
        ? current
        : insertDraw(tx, event, {
            ...solverFlags,
            executedAt: new Date(),
          });

      const usedTokens = new Set(existing.map((a) => a.revealToken));
      const assignment = mustExist(
        tx
          .insert(schema.assignment)
          .values({
            drawId: draw.id,
            giverId,
            receiverId,
            revealToken: allocateUniqueRevealToken(usedTokens),
          })
          .returning()
          .all()[0],
        "Could not create assignment.",
      );
      return { assignment, draw };
    }));
  } catch (error) {
    rethrowDrawConflict(error);
  }

  const [revealLink] = await revealLinksFor([assignment], guests, event.id);

  return { assignment, revealLink, draw };
}
