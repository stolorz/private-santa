"use client";
import { useState } from "react";
import { Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WishlistItem } from "@/lib/db/schema";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { revealApiPath } from "@/lib/public-path";
import {
  resolveTemplateLanguage,
  type TemplateLanguage,
} from "@/lib/templates/fields";

export type WishlistUiCopy = {
  placeholder: string;
  add: string;
  remove: string;
  edit: string;
  save: string;
  cancel: string;
};

const WISHLIST_UI_COPY: Record<TemplateLanguage, WishlistUiCopy> = {
  en: {
    placeholder: "Write a gift idea (e.g. a warm scarf)",
    add: "Add",
    remove: "Remove",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
  },
  pl: {
    placeholder: "Wpisz pomysł na prezent (np. ciepły szalik)",
    add: "Dodaj",
    remove: "Usuń",
    edit: "Edytuj",
    save: "Zapisz",
    cancel: "Anuluj",
  },
  de: {
    placeholder: "Geschenkwunsch eingeben (z. B. ein warmer Schal)",
    add: "Hinzufügen",
    remove: "Entfernen",
    edit: "Bearbeiten",
    save: "Speichern",
    cancel: "Abbrechen",
  },
  es: {
    placeholder: "Escribe una idea de regalo (p. ej., una bufanda)",
    add: "Añadir",
    remove: "Quitar",
    edit: "Editar",
    save: "Guardar",
    cancel: "Cancelar",
  },
  ja: {
    placeholder: "ほしいものを入力（例：あたたかいマフラー）",
    add: "追加する",
    remove: "削除",
    edit: "編集",
    save: "保存",
    cancel: "キャンセル",
  },
};

/** Add / remove / placeholder labels for the guest's own wishlist editor. */
export function wishlistUiCopy(language?: string | null): WishlistUiCopy {
  return WISHLIST_UI_COPY[resolveTemplateLanguage(language)];
}

export function WishlistEditor({
  initial,
  token,
  language,
}: {
  initial: WishlistItem[];
  token: string;
  language?: string | null;
}) {
  const copy = wishlistUiCopy(language);
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const addItem = useMutation((value: string) =>
    requestJson<WishlistItem>(revealApiPath(token, "/wishlist"), {
      method: "POST",
      ...jsonBody({ text: value }),
    }),
  );
  const saveItem = useMutation(
    ({ id, value }: { id: number; value: string }) =>
      requestJson<WishlistItem>(revealApiPath(token, `/wishlist/${id}`), {
        method: "PATCH",
        ...jsonBody({ text: value }),
      }),
  );
  const removeItem = useMutation((id: number) =>
    requestJson(revealApiPath(token, `/wishlist/${id}`), {
      method: "DELETE",
    }),
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const result = await addItem.run(text);
    if (!result.ok) return;
    setItems((prev) => [...prev, result.data]);
    setText("");
  }

  function startEdit(item: WishlistItem) {
    setEditingId(item.id);
    setDraft(item.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (editingId == null) return;
    if (!draft.trim()) return;
    const result = await saveItem.run({ id: editingId, value: draft });
    if (!result.ok) return;
    setItems((prev) =>
      prev.map((item) => (item.id === result.data.id ? result.data : item)),
    );
    cancelEdit();
  }

  async function remove(id: number) {
    const result = await removeItem.run(id);
    if (!result.ok) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) cancelEdit();
  }

  const busy = addItem.busy || saveItem.busy || removeItem.busy;

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-start justify-between gap-2 rounded-xl bg-secondary/70 py-1.5 pr-1.5 pl-4 text-base"
            >
              {editingId === i.id ? (
                <form
                  onSubmit={save}
                  className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                >
                  <Input
                    value={draft}
                    dirty={draft !== i.text}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-10 min-w-0 truncate rounded-xl bg-white px-3 text-base md:text-base"
                  />
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="submit"
                      disabled={saveItem.busy}
                      className="h-9 rounded-lg px-2.5 text-xs sm:text-sm"
                    >
                      {copy.save}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 rounded-lg px-2.5 text-xs text-muted-foreground sm:text-sm"
                      onClick={cancelEdit}
                    >
                      {copy.cancel}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="flex min-w-0 items-start gap-3 py-1.5">
                    <Gift
                      className="mt-0.5 size-4 shrink-0 text-berry"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">{i.text}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      className="h-9 shrink-0 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-white sm:text-sm"
                      disabled={busy}
                      onClick={() => startEdit(i)}
                    >
                      <Pencil aria-hidden="true" />
                      {copy.edit}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-9 shrink-0 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-white hover:text-destructive sm:text-sm"
                      disabled={busy}
                      onClick={() => void remove(i.id)}
                    >
                      <Trash2 aria-hidden="true" />
                      {copy.remove}
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={add} className="flex flex-col gap-2.5 sm:flex-row">
        <Input
          placeholder={copy.placeholder}
          value={text}
          dirty={text !== ""}
          onChange={(e) => setText(e.target.value)}
          className="h-12 min-w-0 truncate rounded-xl bg-white px-4 text-base placeholder:truncate md:text-base"
        />
        <Button
          type="submit"
          disabled={addItem.busy}
          className="h-12 w-full shrink-0 rounded-xl px-4 font-heading text-base sm:w-auto"
        >
          <Plus aria-hidden="true" />
          {copy.add}
        </Button>
      </form>
      {addItem.error && (
        <p className="text-base text-destructive">{addItem.error}</p>
      )}
      {saveItem.error && (
        <p className="text-base text-destructive">{saveItem.error}</p>
      )}
      {removeItem.error && (
        <p className="text-base text-destructive">{removeItem.error}</p>
      )}
    </div>
  );
}
