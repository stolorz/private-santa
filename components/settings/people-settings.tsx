"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Trash2, TriangleAlert } from "lucide-react";
import { isPopperOpen } from "@/components/event-admin/is-popper-open";
import { GuestFields } from "@/components/guests/guest-editor/guest-fields";
import { GuestFormActions } from "@/components/guests/guest-editor/guest-form-actions";
import { GuestRow } from "@/components/guests/guest-editor/guest-row";
import { UnsavedChangesDialog } from "@/components/guests/guest-editor/unsaved-changes-dialog";
import { useGuestDraft } from "@/components/guests/guest-editor/use-guest-draft";
import { usePendingLeave } from "@/components/guests/guest-editor/use-pending-leave";
import {
  SharedContactDialog,
  SharedContactMark,
} from "@/components/guests/shared-contact";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { eventLabel, formatOccursOn } from "@/lib/event-code";
import { missingGenderMessage } from "@/lib/gender";
import { missingPolishCasesMessage } from "@/lib/name-cases";
import {
  displayFetchError,
  jsonBody,
  postPhoto,
  requestJson,
} from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import {
  contactDraftChanged,
  guestContactSummary,
  sharedContactIssuesForDraft,
  sharedContactWarningLines,
  sharedContactsByGuestId,
  type SharedContactIssue,
} from "@/lib/guest-contact";
import type { PersonEventSeat, PersonWithEvents } from "@/lib/people-types";
import { apiPath } from "@/lib/public-path";
import { qty } from "@/lib/utils";

function eventLine(event: PersonEventSeat) {
  return `${eventLabel(event)} · ${formatOccursOn(event.occursOn)}`;
}

function GuestEvents({ events }: { events: PersonEventSeat[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/e/${event.code}/admin`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {eventLine(event)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GuestEventCount({ events }: { events: PersonEventSeat[] }) {
  const n = events.length;
  const label = n === 0 ? "Not in any event" : qty(n, "event", "events");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          className="inline-flex size-9 shrink-0 items-center justify-center gap-0.5 text-muted-foreground"
          aria-label={label}
        >
          <CalendarDays className="size-4" />
          <span className="text-xs tabular-nums">{n}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="px-2.5 py-1.5">
        {n === 0 ? (
          "Not in any event"
        ) : (
          <ul className="space-y-0.5">
            {events.map((event) => (
              <li key={event.id}>{eventLine(event)}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function GuestRowActions({
  events,
  issues,
  name,
  onDelete,
}: {
  events: PersonEventSeat[];
  issues: SharedContactIssue[];
  name: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <SharedContactMark issues={issues} />
      <GuestEventCount events={events} />
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  );
}

export function PeopleSettings({ people }: { people: PersonWithEvents[] }) {
  const router = useRouter();
  const edit = useGuestDraft();
  const leave = usePendingLeave();
  const [editId, setEditId] = useState<number | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    issues: SharedContactIssue[];
  } | null>(null);
  const [shareWarning, setShareWarning] = useState<SharedContactIssue[] | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<PersonWithEvents | null>(
    null,
  );
  const editIdRef = useRef<number | null>(null);
  const keepLeaveOnPendingSaveRef = useRef(false);

  const deletePerson = useMutation(
    useCallback(
      (id: number) =>
        requestJson(apiPath(`/api/people/${id}`), { method: "DELETE" }),
      [],
    ),
    { fallbackError: "Could not delete guest." },
  );

  const contacts = useMemo(
    () =>
      people.map((p) => ({
        id: p.id,
        name: editId === p.id ? edit.name || p.name : p.name,
        phone: editId === p.id ? edit.phone || null : p.phone,
        email: editId === p.id ? edit.email || null : p.email,
      })),
    [people, editId, edit.name, edit.phone, edit.email],
  );
  const sharedById = useMemo(
    () => sharedContactsByGuestId(contacts),
    [contacts],
  );

  function cancelEdit() {
    leave.clear();
    editIdRef.current = null;
    setEditId(null);
    edit.reset();
    edit.setBusy(false);
    setPendingSave(null);
    setShareWarning(null);
  }

  function beginEdit(p: PersonWithEvents) {
    editIdRef.current = p.id;
    setEditId(p.id);
    edit.fillFrom(p);
    edit.setError(null);
    edit.setBusy(false);
    setPendingSave(null);
    setShareWarning(null);
  }

  function requestEdit(p: PersonWithEvents) {
    if (editId === p.id) return;
    const current = people.find((person) => person.id === editId);
    leave.tryLeave(current != null && edit.isDirty(current), () => beginEdit(p));
  }

  function onEditKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (isPopperOpen()) return;
    e.preventDefault();
    cancelEdit();
  }

  async function persistEdited() {
    if (editId == null || edit.busy) return;
    const caseMessage = missingPolishCasesMessage(edit.cases);
    const genderMessage = missingGenderMessage(edit.gender);
    if (caseMessage || genderMessage) {
      edit.setError(genderMessage ?? caseMessage);
      return;
    }
    const id = editId;
    const payload = edit.toBody();
    edit.setBusy(true);
    edit.setError(null);
    try {
      const result = await requestJson(apiPath(`/api/people/${id}`), {
        method: "PUT",
        ...jsonBody(payload),
      });
      if (result.ok) {
        const go = leave.take();
        if (go) {
          go();
        } else if (editIdRef.current === id) {
          cancelEdit();
        }
        router.refresh();
        return;
      }
      leave.clear();
      if (editIdRef.current === id) {
        edit.setError(
          displayFetchError(result.error, "Could not save guest."),
        );
      }
    } finally {
      if (editIdRef.current === id) edit.setBusy(false);
    }
  }

  function savePerson(e: React.FormEvent) {
    e.preventDefault();
    if (
      editId == null ||
      edit.busy ||
      missingPolishCasesMessage(edit.cases) ||
      missingGenderMessage(edit.gender)
    ) {
      return;
    }
    const person = people.find((p) => p.id === editId);
    const issues = sharedContactIssuesForDraft(contacts, {
      id: editId,
      phone: edit.phone,
      email: edit.email,
    });
    const showShare =
      issues.length > 0 &&
      contactDraftChanged(
        person ? { phone: person.phone, email: person.email } : undefined,
        { phone: edit.phone, email: edit.email },
      );
    if ((person?.events.length ?? 0) > 0) {
      setPendingSave({ issues: showShare ? issues : [] });
      return;
    }
    if (showShare) {
      setShareWarning(issues);
      return;
    }
    void persistEdited();
  }

  async function uploadPhoto(id: number, file: File) {
    const result = await postPhoto(apiPath(`/api/people/${id}/photo`), file);
    if (result.ok) {
      router.refresh();
      return;
    }
    edit.setError(
      displayFetchError(result.error, "Could not upload photo."),
    );
  }

  function askDelete(person: PersonWithEvents) {
    deletePerson.setError(null);
    setPendingDelete(person);
  }

  async function confirmDelete() {
    if (!pendingDelete || deletePerson.busy) return;
    const id = pendingDelete.id;
    const result = await deletePerson.run(id);
    if (!result.ok) return;
    setPendingDelete(null);
    if (editId === id) cancelEdit();
    router.refresh();
  }

  const editing = people.find((p) => p.id === editId) ?? null;
  const editDirty = editing != null && edit.isDirty(editing);
  const editCaseMessage = missingPolishCasesMessage(edit.cases);
  const editGenderMessage = missingGenderMessage(edit.gender);

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          {people.length === 0 && (
            <p className="text-sm text-muted-foreground">No guests yet.</p>
          )}
          <ul className="space-y-2">
            {people.map((p) => {
              const summary = guestContactSummary(p);
              const genderError = missingGenderMessage(p.gender);
              if (editId === p.id) {
                const editIssues = sharedContactIssuesForDraft(contacts, {
                  id: p.id,
                  phone: edit.phone,
                  email: edit.email,
                });
                return (
                  <GuestRow
                    key={p.id}
                    name={edit.name || p.name}
                    photo={p.photo}
                    issues={editIssues}
                    editing
                    onPickPhoto={(file) => uploadPhoto(p.id, file)}
                    photoDisabled={edit.busy}
                    extra={<GuestEvents events={p.events} />}
                    actions={
                      <GuestRowActions
                        events={p.events}
                        issues={editIssues}
                        name={p.name}
                        onDelete={() => askDelete(p)}
                      />
                    }
                  >
                    <form
                      id="edit-person-form"
                      onSubmit={savePerson}
                      onKeyDown={onEditKeyDown}
                      className="grid gap-2 sm:grid-cols-2 sm:items-start"
                    >
                      <GuestFields
                        idPrefix="edit-person"
                        draft={edit}
                        autoFocus
                        disabled={edit.busy}
                        dirty={edit.dirtyFields(p)}
                      />
                      {editGenderMessage ? (
                        <p className="text-sm text-destructive sm:col-span-2">
                          {editGenderMessage}
                        </p>
                      ) : null}
                      {editCaseMessage ? (
                        <p className="text-sm text-destructive sm:col-span-2">
                          {editCaseMessage}
                        </p>
                      ) : null}
                      <GuestFormActions
                        busy={edit.busy}
                        saveDisabled={
                          !editDirty ||
                          editCaseMessage != null ||
                          editGenderMessage != null
                        }
                        onCancel={cancelEdit}
                      />
                    </form>
                  </GuestRow>
                );
              }
              const issues = sharedById.get(p.id) ?? [];
              return (
                <GuestRow
                  key={p.id}
                  name={p.name}
                  photo={p.photo}
                  summary={summary}
                  error={genderError}
                  issues={issues}
                  onOpen={() => requestEdit(p)}
                  onPickPhoto={(file) => uploadPhoto(p.id, file)}
                  actions={
                    <GuestRowActions
                      events={p.events}
                      issues={issues}
                      name={p.name}
                      onDelete={() => askDelete(p)}
                    />
                  }
                />
              );
            })}
          </ul>
          {edit.error && (
            <p className="text-sm text-destructive">{edit.error}</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingSave != null}
        onOpenChange={(open) => {
          if (!open && !edit.busy) {
            setPendingSave(null);
            if (keepLeaveOnPendingSaveRef.current) {
              keepLeaveOnPendingSaveRef.current = false;
              return;
            }
            leave.clear();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {editing && pendingSave && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 text-left">
                  <div className="mt-0.5 rounded-full bg-amber-500/15 p-2">
                    <TriangleAlert className="size-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="space-y-1.5">
                    <DialogTitle>Save changes to {editing.name}?</DialogTitle>
                    <DialogDescription>
                      This person is a guest in{" "}
                      {qty(editing.events.length, "event", "events")}. The
                      change will apply in all of them.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {editing.events.map((event) => (
                  <li key={event.id}>{eventLine(event)}</li>
                ))}
              </ul>
              {pendingSave.issues.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {sharedContactWarningLines(pendingSave.issues).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={edit.busy}
                  onClick={() => {
                    setPendingSave(null);
                    leave.clear();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    edit.busy ||
                    editCaseMessage != null ||
                    editGenderMessage != null
                  }
                  onClick={() => {
                    keepLeaveOnPendingSaveRef.current = true;
                    setPendingSave(null);
                    void persistEdited();
                  }}
                >
                  Save changes
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog
        open={leave.open}
        busy={edit.busy}
        onStay={leave.stay}
        onDiscard={() => {
          const go = leave.take();
          go?.();
        }}
        saveDisabled={
          !editDirty || editCaseMessage != null || editGenderMessage != null
        }
        onSave={() => leave.submitForm("edit-person-form")}
      />
      <SharedContactDialog
        issues={shareWarning}
        onCancel={() => {
          setShareWarning(null);
          leave.clear();
        }}
        onConfirm={() => {
          setShareWarning(null);
          void persistEdited();
        }}
      />

      <Dialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deletePerson.busy) {
            setPendingDelete(null);
            deletePerson.setError(null);
          }
        }}
      >
        <DialogContent className="border-destructive/30 sm:max-w-md">
          {pendingDelete && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3 text-left">
                  <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
                    <TriangleAlert className="size-5 text-destructive" />
                  </div>
                  <div className="space-y-1.5">
                    <DialogTitle>
                      Delete {pendingDelete.name} from the database?
                    </DialogTitle>
                    <DialogDescription>
                      {pendingDelete.events.length === 0
                        ? "They are not a guest in any event. This cannot be undone."
                        : `They will be removed from ${qty(pendingDelete.events.length, "event", "events")}. This cannot be undone.`}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              {pendingDelete.events.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {pendingDelete.events.map((event) => (
                    <li key={event.id}>{eventLine(event)}</li>
                  ))}
                </ul>
              )}
              {deletePerson.error && (
                <p className="text-sm text-destructive">{deletePerson.error}</p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deletePerson.busy}
                  onClick={() => {
                    setPendingDelete(null);
                    deletePerson.setError(null);
                  }}
                >
                  Keep guest
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletePerson.busy}
                  onClick={() => void confirmDelete()}
                >
                  Delete person
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
