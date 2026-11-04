"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { ExistingPersonPicker } from "@/components/inputs/existing-person-picker";
import { GuestAvatar } from "@/components/guests/guest-avatar";
import { GuestFields } from "@/components/guests/guest-editor/guest-fields";
import { GuestFormActions } from "@/components/guests/guest-editor/guest-form-actions";
import { GuestRow } from "@/components/guests/guest-editor/guest-row";
import { UnsavedChangesDialog } from "@/components/guests/guest-editor/unsaved-changes-dialog";
import {
  emptyGuestDraftSource,
  useGuestDraft,
} from "@/components/guests/guest-editor/use-guest-draft";
import { usePendingLeave } from "@/components/guests/guest-editor/use-pending-leave";
import {
  SharedContactDialog,
  SharedContactMark,
  guestRowClass,
} from "@/components/guests/shared-contact";
import { SameNameDialog } from "@/components/guests/same-name-dialog";
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
  TooltipProvider,
} from "@/components/ui/tooltip";
import { isPopperOpen } from "@/components/event-admin/is-popper-open";
import type { GuestView, Person } from "@/lib/db/schema";
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
  sharedContactsByGuestId,
  type SharedContactIssue,
} from "@/lib/guest-contact";
import {
  fillEmptyIdentity,
  type GuestDraftSource,
} from "@/lib/guest-draft";
import { missingGenderMessage } from "@/lib/gender";
import {
  OPTIONAL_NAME_CASE_FIELDS,
  emptyNameCaseForm,
  missingPolishCasesMessage,
  optionalNameCasesFromBody,
} from "@/lib/name-cases";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import { normalizeName } from "@/lib/person-name";
import type { GuestDeleteScope, PersonWithEvents } from "@/lib/people-types";
import { eventApiPath } from "@/lib/public-path";
import { cn, qty } from "@/lib/utils";

export function GuestsTab({
  code,
  guests,
  otherEventSeats,
  people,
}: {
  code: string;
  guests: GuestView[];
  otherEventSeats: Record<number, number>;
  people: PersonWithEvents[];
}) {
  const router = useRouter();
  const add = useGuestDraft();
  const edit = useGuestDraft();
  const leave = usePendingLeave();
  const [addingGuest, setAddingGuest] = useState(false);
  const [addBaseline, setAddBaseline] = useState<GuestDraftSource>(
    emptyGuestDraftSource,
  );
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [sameNameMatches, setSameNameMatches] = useState<
    PersonWithEvents[] | null
  >(null);
  const [shareWarning, setShareWarning] = useState<{
    action: "add" | "edit";
    issues: SharedContactIssue[];
  } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [pendingGuest, setPendingGuest] = useState<GuestView | null>(null);
  const [deleteScope, setDeleteScope] = useState<GuestDeleteScope>("event");
  const editIdRef = useRef<number | null>(null);
  const deleteGuest = useMutation(
    useCallback(
      async (input: { id: number; scope: GuestDeleteScope }) =>
        requestJson(
          `${eventApiPath(code, `/guests/${input.id}`)}?scope=${input.scope}`,
          { method: "DELETE" },
        ),
      [code],
    ),
    { fallbackError: "Could not remove guest." },
  );
  const seatedPersonIds = new Set(guests.map((g) => g.personId));
  const unusedPeople = people.filter((p) => !seatedPersonIds.has(p.id));
  const selectedPerson =
    selectedPersonId == null
      ? undefined
      : people.find((p) => p.id === selectedPersonId);
  const attachingExisting = selectedPersonId != null;
  const guestsForShare = useMemo(() => {
    if (editId != null) {
      return guests.map((g) =>
        g.id === editId
          ? {
              ...g,
              name: edit.name || g.name,
              phone: edit.phone || null,
              email: edit.email || null,
            }
          : g,
      );
    }
    if (addingGuest) {
      return [
        ...guests,
        {
          id: -1,
          name: add.name || "New guest",
          phone: add.phone || null,
          email: add.email || null,
        },
      ];
    }
    return guests;
  }, [
    guests,
    editId,
    edit.name,
    edit.phone,
    edit.email,
    addingGuest,
    add.name,
    add.phone,
    add.email,
  ]);
  const sharedById = useMemo(
    () => sharedContactsByGuestId(guestsForShare),
    [guestsForShare],
  );
  const editingGuest = editId != null ? guests.find((g) => g.id === editId) : undefined;
  const editDirty = editingGuest != null && edit.isDirty(editingGuest);
  const addDirty = addingGuest && add.isDirty(addBaseline);
  const addCaseMessage = missingPolishCasesMessage(add.cases);
  const editCaseMessage = missingPolishCasesMessage(edit.cases);
  const addGenderMessage = missingGenderMessage(add.gender);
  const editGenderMessage = missingGenderMessage(edit.gender);
  const currentDirty = editDirty || addDirty;
  const formBusy = add.busy || edit.busy;
  const activeFormId = addingGuest ? "new-guest-form" : "edit-guest-form";

  function cancelEdit() {
    leave.clear();
    editIdRef.current = null;
    setEditId(null);
    edit.reset();
    edit.setBusy(false);
  }

  function beginEdit(p: GuestView) {
    if (addingGuest) cancelAdd();
    editIdRef.current = p.id;
    setEditId(p.id);
    edit.fillFrom(p);
    edit.setError(null);
    edit.setBusy(false);
  }

  function requestEdit(p: GuestView) {
    if (editId === p.id) return;
    leave.tryLeave(currentDirty, () => beginEdit(p));
  }

  function cancelAdd() {
    leave.clear();
    setAddingGuest(false);
    add.reset();
    setSelectedPersonId(null);
    setAddBaseline(emptyGuestDraftSource());
  }

  function beginAdd() {
    if (editId != null) cancelEdit();
    add.setError(null);
    add.reset();
    setSelectedPersonId(null);
    setAddBaseline(emptyGuestDraftSource());
    setAddingGuest(true);
  }

  function requestAdd() {
    leave.tryLeave(currentDirty, () => beginAdd());
  }

  function onDraftKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (isPopperOpen()) return;
    e.preventDefault();
    cancelAdd();
  }

  function onEditKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (isPopperOpen()) return;
    e.preventDefault();
    cancelEdit();
  }

  async function persistNewGuest(choice?: {
    personId?: number;
    createNew?: boolean;
  }) {
    if (add.busy) return;
    const caseMessage = missingPolishCasesMessage(add.cases);
    const genderMessage = missingGenderMessage(add.gender);
    if (!add.name.trim() || caseMessage || genderMessage) {
      add.setError(genderMessage ?? caseMessage);
      return;
    }
    add.setError(null);
    add.setBusy(true);
    const personId = choice?.personId ?? selectedPersonId;
    try {
      const created = await requestJson<{ id?: number }>(
        eventApiPath(code, "/guests"),
        {
          method: "POST",
          ...jsonBody(
            personId != null
              ? {
                  personId,
                  language: add.language,
                  gender: add.gender,
                  ...optionalNameCasesFromBody(add.cases),
                }
              : choice?.createNew
                ? { ...add.toBody(), createNew: true }
                : add.toBody(),
          ),
        },
      );
      if (created.ok) {
        if (add.photo && created.data?.id) {
          const photoRes = await postPhoto(
            eventApiPath(code, `/guests/${created.data.id}/photo`),
            add.photo,
          );
          if (!photoRes.ok) {
            const photoError = displayFetchError(
              photoRes.error,
              "Guest added, but the photo failed.",
            );
            leave.clear();
            setAddingGuest(false);
            add.reset();
            setSelectedPersonId(null);
            setAddBaseline(emptyGuestDraftSource());
            add.setError(photoError);
            router.refresh();
            return;
          }
        }
        const go = leave.take();
        if (go) {
          go();
        } else {
          setAddingGuest(false);
          add.reset();
          setSelectedPersonId(null);
          setAddBaseline(emptyGuestDraftSource());
        }
        router.refresh();
        return;
      }
      leave.clear();
      add.setError(
        displayFetchError(created.error, "Could not add guest."),
      );
    } finally {
      add.setBusy(false);
    }
  }

  function namesakesNamed(value: string): PersonWithEvents[] {
    const key = normalizeName(value);
    if (!key) return [];
    return people.filter((person) => normalizeName(person.name) === key);
  }

  function addGuest(e: React.FormEvent) {
    e.preventDefault();
    if (add.busy || !add.name.trim() || addCaseMessage || addGenderMessage) return;
    if (selectedPersonId == null && !add.phone.trim() && !add.email.trim()) {
      const matches = namesakesNamed(add.name);
      if (matches.length > 0) {
        setSameNameMatches(matches);
        return;
      }
    }
    const issues = sharedContactIssuesForDraft(guests, {
      phone: add.phone,
      email: add.email,
    });
    if (issues.length > 0) {
      setShareWarning({ action: "add", issues });
      return;
    }
    void persistNewGuest();
  }

  async function persistEditedGuest() {
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
      const result = await requestJson(eventApiPath(code, `/guests/${id}`), {
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

  function saveGuest(e: React.FormEvent) {
    e.preventDefault();
    if (editId == null || edit.busy || editCaseMessage) return;
    const guest = guests.find((g) => g.id === editId);
    const issues = sharedContactIssuesForDraft(guests, {
      id: editId,
      phone: edit.phone,
      email: edit.email,
    });
    if (
      issues.length > 0 &&
      contactDraftChanged(
        guest ? { phone: guest.phone, email: guest.email } : undefined,
        { phone: edit.phone, email: edit.email },
      )
    ) {
      setShareWarning({ action: "edit", issues });
      return;
    }
    void persistEditedGuest();
  }

  function confirmSharedContact() {
    const pending = shareWarning;
    setShareWarning(null);
    if (pending?.action === "add") void persistNewGuest();
    else if (pending?.action === "edit") void persistEditedGuest();
  }

  function confirmSamePerson(personId: number) {
    setSameNameMatches(null);
    void persistNewGuest({ personId });
  }

  function confirmNewPerson() {
    setSameNameMatches(null);
    void persistNewGuest({ createNew: true });
  }

  function onNewGuestNameBlur(value: string) {
    if (selectedPersonId != null) return;
    const next = fillEmptyIdentity(
      { gender: add.gender, cases: add.cases },
      namesakesNamed(value),
    );
    if (next.gender && next.gender !== add.gender) add.setGender(next.gender);
    if (
      OPTIONAL_NAME_CASE_FIELDS.some(
        ({ field }) => next.cases[field] !== add.cases[field],
      )
    ) {
      add.setCases(next.cases);
    }
  }

  function fillFromPerson(p: Person) {
    add.fillFrom(p);
    setAddBaseline(p);
    setSelectedPersonId(p.id);
  }

  function clearSelectedPerson() {
    add.setName("");
    add.setCases(emptyNameCaseForm());
    add.setPhone("");
    add.setEmail("");
    add.setLanguage(DEFAULT_LANGUAGE);
    add.setGender(null);
    setAddBaseline(emptyGuestDraftSource());
    setSelectedPersonId(null);
  }

  async function uploadGuestPhoto(id: number, file: File) {
    const result = await postPhoto(
      eventApiPath(code, `/guests/${id}/photo`),
      file,
    );
    if (result.ok) {
      router.refresh();
      return;
    }
    const message = displayFetchError(result.error, "Could not upload photo.");
    add.setError(message);
    edit.setError(message);
  }

  function askDelGuest(guest: GuestView) {
    deleteGuest.setError(null);
    setDeleteScope("event");
    setPendingGuest(guest);
  }

  function closeDelGuest() {
    if (deleteGuest.busy) return;
    setPendingGuest(null);
    deleteGuest.setError(null);
    setDeleteScope("event");
  }

  async function confirmDelGuest() {
    if (!pendingGuest || deleteGuest.busy) return;
    const id = pendingGuest.id;
    const result = await deleteGuest.run({ id, scope: deleteScope });
    if (!result.ok) return;
    setPendingGuest(null);
    if (editId === id) cancelEdit();
    router.refresh();
  }

  const guestError = add.error || edit.error;

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <ul className="space-y-2">
            {guests.map((p) => {
              const summary = guestContactSummary(p);
              const genderError = missingGenderMessage(p.gender);
              const actions = (
                <>
                  <SharedContactMark
                    issues={
                      editId === p.id
                        ? sharedContactIssuesForDraft(guests, {
                            id: p.id,
                            phone: edit.phone,
                            email: edit.email,
                          })
                        : (sharedById.get(p.id) ?? [])
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => askDelGuest(p)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </>
              );
              if (editId === p.id) {
                const editIssues = sharedContactIssuesForDraft(guests, {
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
                    onPickPhoto={(file) => uploadGuestPhoto(p.id, file)}
                    photoDisabled={edit.busy}
                    actions={actions}
                  >
                    <form
                      id="edit-guest-form"
                      onSubmit={saveGuest}
                      onKeyDown={onEditKeyDown}
                      className="grid gap-2 sm:grid-cols-2 sm:items-start"
                    >
                      <GuestFields
                        idPrefix="edit-guest"
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
                  onPickPhoto={(file) => uploadGuestPhoto(p.id, file)}
                  actions={actions}
                />
              );
            })}
            {addingGuest && (
              <li
                className={guestRowClass(
                  sharedContactIssuesForDraft(guests, {
                    phone: add.phone,
                    email: add.email,
                  }),
                )}
              >
                <form
                  id="new-guest-form"
                  onSubmit={addGuest}
                  onKeyDown={onDraftKeyDown}
                  className="flex items-start gap-2"
                >
                  <GuestAvatar
                    name={add.name}
                    photo={selectedPerson?.photo}
                    preview={add.photoPreview}
                    onPick={add.pickPhoto}
                    disabled={add.busy}
                  />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:items-start">
                    {unusedPeople.length > 0 ? (
                      <ExistingPersonPicker
                        people={unusedPeople}
                        selectedId={selectedPersonId}
                        onSelect={fillFromPerson}
                        onClear={clearSelectedPerson}
                        disabled={add.busy}
                      />
                    ) : null}
                    <GuestFields
                      idPrefix="new-guest"
                      draft={add}
                      autoFocus
                      disabled={add.busy}
                      nameDisabled={attachingExisting}
                      contactDisabled={attachingExisting}
                      onNameBlur={onNewGuestNameBlur}
                      dirty={add.dirtyFields(addBaseline)}
                    />
                    {addGenderMessage ? (
                      <p className="text-sm text-destructive sm:col-span-2">
                        {addGenderMessage}
                      </p>
                    ) : null}
                    {addCaseMessage ? (
                      <p className="text-sm text-destructive sm:col-span-2">
                        {addCaseMessage}
                      </p>
                    ) : null}
                    <GuestFormActions
                      busy={add.busy}
                      saveDisabled={
                        !add.name.trim() ||
                        addCaseMessage != null ||
                        addGenderMessage != null
                      }
                      onCancel={cancelAdd}
                    />
                  </div>
                  <SharedContactMark
                    issues={sharedContactIssuesForDraft(guests, {
                      phone: add.phone,
                      email: add.email,
                    })}
                  />
                </form>
              </li>
            )}
          </ul>
          {addingGuest || editId != null ? null : (
            <div className="flex justify-end">
              <Button type="button" onClick={requestAdd}>
                <Plus />
                New guest
              </Button>
            </div>
          )}
          {guestError && (
            <p className="text-sm text-destructive">{guestError}</p>
          )}
        </CardContent>
      </Card>
      <UnsavedChangesDialog
        open={leave.open}
        busy={formBusy}
        onStay={leave.stay}
        onDiscard={() => {
          const go = leave.take();
          go?.();
        }}
        saveDisabled={
          addingGuest
            ? !add.name.trim() ||
              addCaseMessage != null ||
              addGenderMessage != null
            : !editDirty ||
              editCaseMessage != null ||
              editGenderMessage != null
        }
        onSave={() => leave.submitForm(activeFormId)}
      />
      <SameNameDialog
        matches={sameNameMatches}
        onCancel={() => {
          setSameNameMatches(null);
          leave.clear();
        }}
        onMerge={confirmSamePerson}
        onCreateNew={confirmNewPerson}
      />
      <SharedContactDialog
        issues={shareWarning?.issues ?? null}
        onCancel={() => {
          setShareWarning(null);
          leave.clear();
        }}
        onConfirm={confirmSharedContact}
      />
      <RemoveGuestDialog
        guest={pendingGuest}
        scope={deleteScope}
        otherEventSeats={
          pendingGuest ? (otherEventSeats[pendingGuest.personId] ?? 0) : 0
        }
        busy={deleteGuest.busy}
        error={deleteGuest.error}
        onScopeChange={setDeleteScope}
        onCancel={closeDelGuest}
        onConfirm={() => void confirmDelGuest()}
      />
    </TooltipProvider>
  );
}

function RemoveGuestDialog({
  guest,
  scope,
  otherEventSeats,
  busy,
  error,
  onScopeChange,
  onCancel,
  onConfirm,
}: {
  guest: GuestView | null;
  scope: GuestDeleteScope;
  otherEventSeats: number;
  busy: boolean;
  error: string | null;
  onScopeChange: (scope: GuestDeleteScope) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={guest != null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="border-destructive/30 sm:max-w-md">
        {guest && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 text-left">
                <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
                  <TriangleAlert className="size-5 text-destructive" />
                </div>
                <div className="space-y-1.5">
                  <DialogTitle>Remove {guest.name}?</DialogTitle>
                  <DialogDescription>
                    Choose whether they leave this event only, or are deleted
                    from the people list entirely.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div
              role="radiogroup"
              aria-label="How to remove this guest"
              className="grid gap-2"
            >
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  scope === "event"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-accent/50",
                )}
              >
                <input
                  type="radio"
                  name="guest-delete-scope"
                  value="event"
                  checked={scope === "event"}
                  onChange={() => onScopeChange("event")}
                  disabled={busy}
                  className="mt-1"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    Remove from this event only
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    They leave this edition. Their name, photo, and contact stay
                    in the people list so you can add them again later.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  scope === "person"
                    ? "border-destructive bg-destructive/5"
                    : "hover:bg-accent/50",
                )}
              >
                <input
                  type="radio"
                  name="guest-delete-scope"
                  value="person"
                  checked={scope === "person"}
                  onChange={() => onScopeChange("person")}
                  disabled={busy}
                  className="mt-1"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    Delete this person completely
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Permanently removes their name, photo, and contact from the
                    database, including every event they are in. This cannot be
                    undone.
                  </span>
                </span>
              </label>
            </div>

            {scope === "person" && otherEventSeats > 0 && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {guest.name} is also a guest in{" "}
                {qty(otherEventSeats, "other event", "other events")}. Completely
                deleting them removes those seats too.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onCancel}
              >
                Keep guest
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={onConfirm}
              >
                {scope === "person"
                  ? "Delete person"
                  : "Remove from this event"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
