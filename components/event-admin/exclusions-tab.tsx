"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PairPicker } from "@/components/event-admin/pair-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SwitchRow } from "@/components/ui/switch-row";
import type { Exclusion, GuestView } from "@/lib/db/schema";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { hasExclusionPair, orderedExclusionNames } from "@/lib/exclusions";
import { eventApiPath } from "@/lib/public-path";

export function ExclusionsTab({
  code,
  guests,
  exclusions,
  allowSelfDraw,
  avoidPastPairings,
  hasPastEditions,
}: {
  code: string;
  guests: GuestView[];
  exclusions: Exclusion[];
  allowSelfDraw: boolean;
  avoidPastPairings: boolean;
  hasPastEditions: boolean;
}) {
  const router = useRouter();
  const [disallowSelfDraw, setDisallowSelfDraw] = useState(!allowSelfDraw);
  const [avoidPast, setAvoidPast] = useState(avoidPastPairings);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [exA, setExA] = useState("");
  const [exB, setExB] = useState("");
  const nameById = useMemo(
    () => new Map(guests.map((p) => [p.id, p.name])),
    [guests],
  );
  const duplicateExclusion =
    !!exA && !!exB && hasExclusionPair(exclusions, Number(exA), Number(exB));

  function exclusionBlockedWith(aId: number, bId: number): boolean {
    return hasExclusionPair(exclusions, aId, bId);
  }

  const addExclusion = useMutation(
    useCallback(
      async (pair: { aId: number; bId: number }) =>
        requestJson(eventApiPath(code, "/exclusions"), {
          method: "POST",
          ...jsonBody(pair),
        }),
      [code],
    ),
    { fallbackError: "Could not add exclusion." },
  );

  async function onAddExclusion(e: React.FormEvent) {
    e.preventDefault();
    if (duplicateExclusion) return;
    const result = await addExclusion.run({
      aId: Number(exA),
      bId: Number(exB),
    });
    if (result.ok) {
      setExA("");
      setExB("");
      router.refresh();
    }
  }

  const delExclusion = useMutation(
    useCallback(
      async (id: number) =>
        requestJson(eventApiPath(code, `/exclusions/${id}`), {
          method: "DELETE",
        }),
      [code],
    ),
    { fallbackError: "Could not remove exclusion." },
  );

  async function onDelExclusion(id: number) {
    const result = await delExclusion.run(id);
    if (result.ok) router.refresh();
  }

  async function persistAutomaticExclusion(body: {
    allowSelfDraw?: boolean;
    avoidPastPairings?: boolean;
  }) {
    const result = await requestJson(eventApiPath(code, "/draw"), {
      method: "PATCH",
      ...jsonBody(body),
    });
    setOptionError(result.ok ? null : result.error);
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Automatic exclusions</CardTitle>
          <CardDescription>
            Rules that apply to every guest. Saved on this edition and used by
            the draw.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <SwitchRow
            title="Disallow self-draw"
            description="Nobody is assigned to themselves."
            checked={disallowSelfDraw}
            onCheckedChange={(value) => {
              setDisallowSelfDraw(value);
              void persistAutomaticExclusion({ allowSelfDraw: !value });
            }}
          />
          <SwitchRow
            title="Avoid past pairings"
            description="Do not repeat giver→receiver pairs from earlier editions. Oldest years are dropped first if the group is too small."
            checked={avoidPast && hasPastEditions}
            onCheckedChange={(value) => {
              setAvoidPast(value);
              void persistAutomaticExclusion({ avoidPastPairings: value });
            }}
            disabled={!hasPastEditions}
            hint="This event has no earlier editions, so there are no past pairings to avoid."
          />
          {optionError && (
            <p className="text-sm text-destructive">{optionError}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Forbidden pairs</CardTitle>
          <CardDescription>
            Neither person will draw the other. Pair someone with themselves to
            stop them drawing their own name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {exclusions.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No forbidden pairs.
              </li>
            )}
            {exclusions.map((ex) => {
              const [left, right] = orderedExclusionNames(
                nameById.get(ex.aId) ?? `#${ex.aId}`,
                nameById.get(ex.bId) ?? `#${ex.bId}`,
              );
              return (
                <li
                  key={ex.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {left} ⇄ {right}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={delExclusion.busy}
                    onClick={() => void onDelExclusion(ex.id)}
                    aria-label="Remove"
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <PairPicker
            left={exA}
            right={exB}
            onLeftChange={setExA}
            onRightChange={setExB}
            leftPlaceholder="Person A"
            rightPlaceholder="Person B"
            leftOptions={guests}
            rightOptions={guests}
            submitLabel="Add"
            submitDisabled={duplicateExclusion}
            isBlocked={exclusionBlockedWith}
            onSubmit={(e) => void onAddExclusion(e)}
          />
          {duplicateExclusion && (
            <p className="text-sm text-muted-foreground">
              That pair is already excluded.
            </p>
          )}
          {addExclusion.error && (
            <p className="text-sm text-destructive">{addExclusion.error}</p>
          )}
          {delExclusion.error && (
            <p className="text-sm text-destructive">{delExclusion.error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
