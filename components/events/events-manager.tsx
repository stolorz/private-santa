"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import type { Event, EventSeries } from "@/lib/db/schema";
import {
  compareEventsByRecency,
  eventLabel,
  formatOccursOn,
  isValidOccursOn,
} from "@/lib/event-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { apiPath } from "@/lib/public-path";
import { cn, qty } from "@/lib/utils";

const START_FRESH = "fresh";

export type SeriesWithEditions = {
  series: EventSeries;
  editions: Array<Event & { problemCount: number }>;
};

type DeleteImpact = {
  guests: number;
  wishlists: number;
  exclusions: number;
  draftDraws: number;
  completedDraws: number;
  otherEditions: number;
};

type DeleteGuest = {
  personId: number;
  name: string;
  exclusive: boolean;
};

type PendingDelete = {
  event: Event;
  seriesName: string;
};

export function EventsManager({ groups }: { groups: SeriesWithEditions[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const createEvent = useMutation(
    (body: Record<string, unknown>) =>
      requestJson<Event & { event?: Event }>(apiPath("/api/events"), {
        method: "POST",
        ...jsonBody(body),
      }),
  );
  const deleteEvent = useMutation(
    (input: { code: string; deletePersonIds: number[] }) =>
      requestJson(apiPath(`/api/events/${encodeURIComponent(input.code)}`), {
        method: "DELETE",
        ...jsonBody({ deletePersonIds: input.deletePersonIds }),
      }),
  );
  const busy = createEvent.busy || deleteEvent.busy;
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [guests, setGuests] = useState<DeleteGuest[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [impactError, setImpactError] = useState(false);
  const pendingIdRef = useRef<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [occursOn, setOccursOn] = useState("");
  const [linkTo, setLinkTo] = useState(START_FRESH);

  const pastEvents = groups
    .flatMap(({ series, editions }) => {
      if (editions.length === 0) return [];
      const event = [...editions].sort(compareEventsByRecency)[0];
      return [{ series, event }];
    })
    .sort((a, b) => compareEventsByRecency(a.event, b.event));
  const linked = pastEvents.find((p) => p.event.code === linkTo);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body =
      linkTo === START_FRESH
        ? { kind: "series" as const, name, occursOn }
        : linked
          ? {
              kind: "edition" as const,
              seriesId: linked.series.id,
              fromCode: linked.event.code,
              name,
              occursOn,
            }
          : null;
    if (!body) {
      setError("Could not find that event.");
      return;
    }
    const result = await createEvent.run(body);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const code = result.data.event?.code ?? result.data.code;
    closeCreate();
    if (code) router.push(`/e/${code}/admin`);
    router.refresh();
  }

  async function loadImpact(ev: Event) {
    pendingIdRef.current = ev.id;
    setImpact(null);
    setGuests([]);
    setImpactError(false);
    const result = await requestJson<{
      series?: { name?: string };
      impact?: DeleteImpact;
      guests?: DeleteGuest[];
    }>(apiPath(`/api/events/${encodeURIComponent(ev.code)}`));
    if (pendingIdRef.current !== ev.id) return;
    if (!result.ok || !result.data.impact) {
      setImpactError(true);
      return;
    }
    setImpact(result.data.impact);
    setGuests(result.data.guests ?? []);
    if (result.data.series?.name) {
      const seriesName = result.data.series.name;
      setPending((p) =>
        p && p.event.id === ev.id ? { ...p, seriesName } : p,
      );
    }
  }

  function closeDelete() {
    pendingIdRef.current = null;
    setPending(null);
    setImpact(null);
    setGuests([]);
    setSelected(new Set());
    setImpactError(false);
  }

  function closeCreate() {
    setCreating(false);
    setName("");
    setOccursOn("");
    setLinkTo(START_FRESH);
  }

  function openCreate() {
    closeDelete();
    setError(null);
    setCreating(true);
  }

  async function openDelete(ev: Event, seriesName: string) {
    closeCreate();
    setError(null);
    setSelected(new Set());
    setGuests([]);
    setPending({ event: ev, seriesName });
    await loadImpact(ev);
  }

  function toggleGuest(personId: number, exclusive: boolean) {
    if (!exclusive) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function chooseLink(value: string) {
    setLinkTo(value);
    if (value === START_FRESH) return;
    const source = pastEvents.find((p) => p.event.code === value);
    if (!source) return;
    setName(eventLabel(source.event));
    const next = suggestNextOccursOn(source.event.occursOn);
    if (next) setOccursOn(next);
  }

  async function confirmDelete() {
    if (!pending) return;
    const ev = pending.event;
    setError(null);
    const result = await deleteEvent.run({
      code: ev.code,
      deletePersonIds: [...selected],
    });
    if (!result.ok) {
      setError(result.error);
      closeDelete();
      return;
    }
    closeDelete();
    router.refresh();
  }

  const blocked = (impact?.completedDraws ?? 0) > 0;
  const loadingImpact = pending !== null && impact === null && !impactError;

  return (
    <div className="space-y-3">
      {error && !creating && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {groups.map(({ series, editions }) => (
        <section key={series.id} aria-label={series.name}>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {editions.map((ev) => (
              <li key={ev.id} className="flex items-stretch">
                <Button
                  asChild
                  variant="ghost"
                  className="grid h-auto min-w-0 flex-1 grid-cols-[minmax(0,1.2fr)_auto_minmax(0,0.8fr)] items-center gap-2 whitespace-normal rounded-none px-3 py-2.5"
                >
                  <Link href={`/e/${ev.code}/admin`}>
                    <span className="min-w-0 truncate text-left text-lg font-semibold">
                      {eventLabel(ev)}
                    </span>
                    <span className="text-center text-sm font-normal text-muted-foreground">
                      {formatOccursOn(ev.occursOn)}
                    </span>
                    <span
                      className={
                        ev.problemCount > 0
                          ? "text-right text-sm font-medium text-destructive"
                          : undefined
                      }
                    >
                      {ev.problemCount > 0
                        ? qty(ev.problemCount, "problem", "problems")
                        : null}
                    </span>
                  </Link>
                </Button>
                <div className="flex shrink-0 items-center pr-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => void openDelete(ev, series.name)}
                    aria-label="Delete"
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex justify-end">
        <Button type="button" disabled={busy} onClick={openCreate}>
          <Plus />
          New event
        </Button>
      </div>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open && !busy) closeCreate();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={create} className="contents">
            <DialogHeader>
              <div className="flex items-start gap-3 text-left">
                <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                  <Plus className="size-5 text-primary" />
                </div>
                <div className="space-y-1.5">
                  <DialogTitle>New event</DialogTitle>
                  <DialogDescription>
                    {pastEvents.length === 0
                      ? "Starts a named event with its first date."
                      : "Start a fresh series, or add another date based on a previous event."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {error && creating && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {pastEvents.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="create-link">Based on</Label>
                <Select value={linkTo} onValueChange={chooseLink}>
                  <SelectTrigger id="create-link" dirty={linkTo !== START_FRESH}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={START_FRESH}>Start fresh</SelectItem>
                    {pastEvents.map(({ event }) => (
                      <SelectItem key={event.code} value={event.code}>
                        {eventLabel(event)} · {formatOccursOn(event.occursOn)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linked && (
                  <p className="text-sm text-muted-foreground">
                    Adds another date to “{linked.series.name}”. Guests and
                    exclusions are copied. Wishlists start empty.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="create-name">Name</Label>
                <Input
                  id="create-name"
                  value={name}
                  dirty={name !== ""}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Xmas"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-date">Date</Label>
                <Input
                  id="create-date"
                  type="date"
                  value={occursOn}
                  dirty={occursOn !== ""}
                  onChange={(e) => setOccursOn(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={closeCreate}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) closeDelete();
        }}
      >
        <DialogContent className="border-destructive/30 sm:max-w-md">
          {pending && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 text-left">
                  <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
                    <TriangleAlert className="size-5 text-destructive" />
                  </div>
                  <div className="space-y-1.5">
                    <DialogTitle>Delete this event permanently?</DialogTitle>
                    <DialogDescription>
                      This cannot be undone. Read what will be removed before
                      you continue.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="truncate font-medium">
                  {eventLabel(pending.event)}
                </dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd>{formatOccursOn(pending.event.occursOn)}</dd>
                <dt className="text-muted-foreground">Event</dt>
                <dd className="truncate">{pending.seriesName}</dd>
              </dl>

              {loadingImpact && (
                <p className="text-sm text-muted-foreground">
                  Checking what will be deleted…
                </p>
              )}

              {impactError && (
                <p className="text-sm text-muted-foreground">
                  Could not load a full summary. Deleting still removes this
                  edition and everything attached to it.
                </p>
              )}

              {impact && blocked && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive">
                  This edition cannot be deleted because a draw has already
                  been completed. Pairings and reveal links would be lost.
                </p>
              )}

              {impact && !blocked && (
                <div className="space-y-3 text-sm">
                  <p className="font-medium">
                    If you proceed, all of the following is deleted:
                  </p>
                  <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                    <li>This edition&apos;s page and settings</li>
                    <li>
                      {impact.guests === 0
                        ? "No guest seats in this edition"
                        : `${qty(impact.guests, "guest seat", "guest seats")} in this edition`}
                    </li>
                    {impact.wishlists > 0 && (
                      <li>
                        {qty(
                          impact.wishlists,
                          "wishlist item",
                          "wishlist items",
                        )}
                      </li>
                    )}
                    {impact.exclusions > 0 && (
                      <li>
                        {qty(
                          impact.exclusions,
                          "exclusion rule",
                          "exclusion rules",
                        )}
                      </li>
                    )}
                    {impact.draftDraws > 0 && (
                      <li>
                        {qty(
                          impact.draftDraws,
                          "unfinished draw",
                          "unfinished draws",
                        )}
                        , including pairings and private reveal links
                      </li>
                    )}
                    {impact.otherEditions === 0 && (
                      <li>
                        The whole event “{pending.seriesName}”, because this is
                        its last remaining edition
                      </li>
                    )}
                  </ul>
                  {guests.length > 0 && (
                    <GuestDeleteList
                      guests={guests}
                      selected={selected}
                      disabled={busy}
                      onToggle={toggleGuest}
                    />
                  )}
                  <p className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
                    {selected.size === 0
                      ? "Names, phone numbers, emails, and login accounts are kept."
                      : `${qty(selected.size, "checked guest", "checked guests")} will also be deleted from the people list. Unchecked guests and guests in other events keep their names and contact details. Login accounts stay.`}
                    {impact.otherEditions > 0
                      ? ` ${qty(impact.otherEditions, "other edition", "other editions")} of “${pending.seriesName}” will stay.`
                      : null}
                  </p>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={closeDelete}
                >
                  Keep event
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || loadingImpact || blocked}
                  onClick={() => void confirmDelete()}
                >
                  Delete permanently
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuestDeleteList({
  guests,
  selected,
  disabled,
  onToggle,
}: {
  guests: DeleteGuest[];
  selected: Set<number>;
  disabled: boolean;
  onToggle: (personId: number, exclusive: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        Also delete from the people list
      </legend>
      <p className="text-sm text-muted-foreground">
        Only guests who are not in any other event can be removed from the
        database.
      </p>
      <ul className="max-h-56 space-y-2 overflow-y-auto">
        {guests.map((guest) => {
          const checked = selected.has(guest.personId);
          return (
            <li key={guest.personId}>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left",
                  guest.exclusive
                    ? "cursor-pointer hover:bg-accent/50"
                    : "cursor-not-allowed",
                  checked && "border-destructive bg-destructive/5",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={disabled || !guest.exclusive}
                  onChange={() => onToggle(guest.personId, guest.exclusive)}
                />
                <span className="space-y-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      !guest.exclusive && "text-muted-foreground",
                    )}
                  >
                    {guest.name}
                  </span>
                  {!guest.exclusive && (
                    <span className="block text-sm text-muted-foreground">
                      Also in another event
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function suggestNextOccursOn(occursOn: string): string {
  const [y, m, d] = occursOn.split("-").map(Number);
  if (!y || !m || !d) return "";
  const next = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidOccursOn(next) ? next : "";
}
