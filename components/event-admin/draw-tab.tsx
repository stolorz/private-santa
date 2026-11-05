"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DrawConfirmDialog } from "@/components/event-admin/draw-confirm-dialog";
import { GuestRevealLinks } from "@/components/event-admin/guest-reveal-links";
import { PairPicker } from "@/components/event-admin/pair-picker";
import type {
  CurrentDrawView,
  DrawResponse,
} from "@/components/event-admin/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocalDateTime } from "@/components/ui/local-date-time";
import {
  drawReadiness,
  hasPastPairing,
  possibleRecipientsByGiver,
} from "@/lib/draw";
import { drawResultsFilename } from "@/lib/draw-results-csv";
import { drawConstraintSummary } from "@/lib/draw-summary";
import type { Exclusion, GuestView } from "@/lib/db/schema";
import { hasExclusionPair } from "@/lib/exclusions";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { eventApiPath } from "@/lib/public-path";

export function DrawTab({
  code,
  guests,
  exclusions,
  currentDraw,
  hasPastEditions,
  allowSelfDraw,
  avoidPastPairings,
  pastPairings = [],
  occursOn,
}: {
  code: string;
  guests: GuestView[];
  exclusions: Exclusion[];
  currentDraw: CurrentDrawView | null;
  hasPastEditions: boolean;
  allowSelfDraw: boolean;
  avoidPastPairings: boolean;
  pastPairings?: Array<[number, number]>;
  occursOn: string;
}) {
  const router = useRouter();
  const disallowSelfDraw = !allowSelfDraw;
  const applyAvoidPastPairings = avoidPastPairings && hasPastEditions;
  const activePastPairings = useMemo(
    () => (applyAvoidPastPairings ? pastPairings : []),
    [applyAvoidPastPairings, pastPairings],
  );
  const [pairGiver, setPairGiver] = useState("");
  const [pairReceiver, setPairReceiver] = useState("");
  const [drawConfirmOpen, setDrawConfirmOpen] = useState(false);

  const nameById = useMemo(
    () => new Map(guests.map((p) => [p.id, p.name])),
    [guests],
  );
  const assignedGiverIds = new Set(currentDraw?.assignedGiverIds ?? []);
  const assignedReceiverIds = new Set(currentDraw?.assignedReceiverIds ?? []);
  const leftoverGivers = guests.filter((g) => !assignedGiverIds.has(g.id));
  const leftoverReceivers = guests.filter(
    (g) => !assignedReceiverIds.has(g.id),
  );
  const { everyoneGives, canDrawRemaining } = drawReadiness({
    guestCount: guests.length,
    leftoverGivers: leftoverGivers.length,
    leftoverReceivers: leftoverReceivers.length,
    leftoverGiverId: leftoverGivers[0]?.id,
    leftoverReceiverId: leftoverReceivers[0]?.id,
    disallowSelfDraw,
  });
  const hasPairs = assignedGiverIds.size > 0;

  function pairBlocked(giverId: number, receiverId: number) {
    if (giverId === receiverId && disallowSelfDraw) return true;
    if (hasExclusionPair(exclusions, giverId, receiverId)) return true;
    return hasPastPairing(activePastPairings, giverId, receiverId);
  }

  const possibleByGiver = useMemo(
    () =>
      possibleRecipientsByGiver(
        leftoverGivers.map((g) => g.id),
        leftoverReceivers.map((g) => g.id),
        exclusions.map((e) => [e.aId, e.bId] as [number, number]),
        { allowSelfDraw, pastPairings: activePastPairings },
      ),
    [
      leftoverGivers,
      leftoverReceivers,
      exclusions,
      allowSelfDraw,
      activePastPairings,
    ],
  );
  const drawPreviewGivers = leftoverGivers.map((giver) => ({
    id: giver.id,
    name: giver.name,
    recipients: (possibleByGiver.get(giver.id) ?? []).map(
      (id) => nameById.get(id) ?? String(id),
    ),
  }));

  const postDraw = useCallback(async () => {
    return requestJson<DrawResponse>(eventApiPath(code, "/draw"), {
      method: "POST",
    });
  }, [code]);

  const drawMutation = useMutation(postDraw, { fallbackError: "Draw failed." });

  function onDrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDrawConfirmOpen(true);
  }

  async function submitDraw() {
    drawMutation.setError(null);
    const response = await drawMutation.run(undefined);
    setDrawConfirmOpen(false);
    if (!response.ok) return;
    router.refresh();
  }

  const addPair = useMutation(
    useCallback(
      async (pair: { giverId: number; receiverId: number }) =>
        requestJson(eventApiPath(code, "/assignments"), {
          method: "POST",
          ...jsonBody(pair),
        }),
      [code],
    ),
    { fallbackError: "Could not add pair." },
  );

  async function addManualPair(e: React.FormEvent) {
    e.preventDefault();
    if (!pairGiver || !pairReceiver) return;
    const response = await addPair.run({
      giverId: Number(pairGiver),
      receiverId: Number(pairReceiver),
    });
    if (!response.ok) return;
    setPairGiver("");
    setPairReceiver("");
    router.refresh();
  }

  const drawView = currentDraw
    ? {
        draw: currentDraw.draw,
        revealLinks: currentDraw.revealLinks,
        assignments: currentDraw.revealLinks.length,
      }
    : null;

  return (
    <>
      {drawView && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Current draw</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={eventApiPath(code, "/draw/results")}
                  download={drawResultsFilename(occursOn)}
                >
                  Export CSV
                </a>
              </Button>
            </div>
            <CardDescription>
              One result at a time. Remove a pair to free that giver, or add
              guests and draw the rest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">
              Draw &quot;{drawView.draw.name}&quot; — {drawView.assignments}{" "}
              pairs.
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                Drawn{" "}
                <LocalDateTime
                  value={drawView.draw.executedAt ?? drawView.draw.createdAt}
                />
              </li>
              {drawView.draw.durationMs != null && (
                <li>Took {formatDuration(drawView.draw.durationMs)}</li>
              )}
              {drawView.draw.attempts != null && (
                <li>
                  {drawView.draw.attempts} solver{" "}
                  {drawView.draw.attempts === 1 ? "attempt" : "attempts"}
                </li>
              )}
              <li>
                {drawConstraintSummary(drawView.draw, {
                  hasEarlierEditions: hasPastEditions,
                })}
              </li>
            </ul>
            {drawView.revealLinks.length > 0 && (
              <GuestRevealLinks
                code={code}
                links={drawView.revealLinks}
                onRefresh={() => router.refresh()}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a pair</CardTitle>
          <CardDescription>
            Pin a giver to a receiver. Draw will only assign guests who do not
            already have a match.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {everyoneGives ? (
            <p className="text-sm text-muted-foreground">
              Everyone already has someone to give to. Remove a pair first if
              you need to change it.
            </p>
          ) : (
            <PairPicker
              left={pairGiver}
              right={pairReceiver}
              onLeftChange={setPairGiver}
              onRightChange={setPairReceiver}
              leftPlaceholder="Giver"
              rightPlaceholder="Receiver"
              leftOptions={leftoverGivers}
              rightOptions={leftoverReceivers}
              submitLabel="Add pair"
              disabled={addPair.busy}
              isBlocked={pairBlocked}
              onSubmit={(e) => void addManualPair(e)}
            />
          )}
          {addPair.error && (
            <p className="text-sm text-destructive">{addPair.error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{hasPairs ? "Draw remaining" : "Run the draw"}</CardTitle>
          <CardDescription>
            {hasPairs
              ? "Assigns everyone who does not already have a match. Existing pairs are kept. Send invitations from Delivery."
              : "Assigns everyone respecting exclusions. Send invitations from Delivery."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onDrawSubmit} className="space-y-4">
            <Button
              type="submit"
              disabled={drawMutation.busy || !canDrawRemaining}
            >
              {drawMutation.busy
                ? "Drawing…"
                : hasPairs
                  ? "Draw remaining"
                  : "Run draw 🎲"}
            </Button>
            {!canDrawRemaining && everyoneGives && (
              <p className="text-sm text-muted-foreground">
                Everyone already has someone to give to.
              </p>
            )}
          </form>

          {drawMutation.error && (
            <p className="mt-4 text-sm text-destructive">
              {drawMutation.error}
            </p>
          )}
        </CardContent>
      </Card>
      <DrawConfirmDialog
        open={drawConfirmOpen}
        running={drawMutation.busy}
        hasPairs={hasPairs}
        avoidPastPairings={applyAvoidPastPairings}
        givers={drawPreviewGivers}
        onCancel={() => setDrawConfirmOpen(false)}
        onContinue={() => {
          void submitDraw();
        }}
      />
    </>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
