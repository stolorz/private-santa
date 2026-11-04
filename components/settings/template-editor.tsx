"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { dirtyFieldClass, invalidFieldClass } from "@/components/ui/dirty-field";
import { cn } from "@/lib/utils";
import { genderLabel } from "@/lib/gender";
import { COUNT_BRANCH_LABELS, isCountBranchKey } from "@/lib/templates/count";
import {
  insertTemplatePlaceholder,
  suggestSelectBranchKeys,
  suggestTemplatePlaceholders,
  templatePlaceholderAt,
} from "@/lib/templates/autocomplete";
import {
  TEMPLATE_PLACEHOLDERS,
  TEMPLATE_PLACEHOLDER_LABELS,
  type TemplatePlaceholder,
} from "@/lib/templates/fields";
import {
  parseTemplatePlaceholders,
  type TemplatePlaceholderSpan,
  type TemplateTokenPart,
} from "@/lib/templates/parse";

const FIELD =
  "w-full bg-transparent px-3 text-base leading-normal md:text-sm outline-none";

function fitTextareaHeight(el: HTMLTextAreaElement) {
  if (el.offsetWidth === 0) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function TemplateEditor({
  id,
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder,
  dirty,
  invalid,
  placeholders = TEMPLATE_PLACEHOLDERS,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  dirty?: boolean;
  invalid?: boolean;
  placeholders?: readonly string[];
}) {
  const listId = useId();
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const at = templatePlaceholderAt(value, Math.min(cursor, value.length));
  const selectVar = at?.mode === "branch_key" ? at.selectVar : "";
  const suggestions = useMemo(() => {
    if (!at) return [];
    return at.mode === "branch_key"
      ? suggestSelectBranchKeys(at.query, at.selectVar)
      : suggestTemplatePlaceholders(at.query, placeholders);
    // `at` is a new object each render; mode/query/selectVar are the stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at?.mode, at?.query, selectVar, placeholders]);
  const showMenu =
    focused && !dismissed && at != null && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [at?.query, at?.mode]);

  useLayoutEffect(() => {
    const el = controlRef.current;
    if (!el) return;
    if (pendingCursor.current != null) {
      const pos = pendingCursor.current;
      pendingCursor.current = null;
      el.setSelectionRange(pos, pos);
      setCursor(pos);
      return;
    }
    if (focused) setCursor(el.selectionStart ?? 0);
  }, [value, focused]);

  useEffect(() => {
    if (!focused) return;
    function onSelectionChange() {
      const el = controlRef.current;
      if (!el || document.activeElement !== el) return;
      setCursor(el.selectionStart ?? 0);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, [focused]);

  useLayoutEffect(() => {
    if (!showMenu) return;
    document
      .getElementById(`${listId}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, showMenu]);

  useLayoutEffect(() => {
    if (!multiline) return;
    const el = controlRef.current;
    if (!(el instanceof HTMLTextAreaElement)) return;
    fitTextareaHeight(el);
    const observer = new ResizeObserver(() => fitTextareaHeight(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, multiline]);

  function readCursor(el: HTMLInputElement | HTMLTextAreaElement) {
    setCursor(el.selectionStart ?? 0);
  }

  function syncScroll() {
    const el = controlRef.current;
    const overlay = overlayRef.current;
    if (!el || !overlay) return;
    overlay.scrollTop = el.scrollTop;
    overlay.scrollLeft = el.scrollLeft;
  }

  function insert(name: string) {
    const next = insertTemplatePlaceholder(value, cursor, name);
    pendingCursor.current = next.cursor;
    setCursor(next.cursor);
    setDismissed(true);
    onChange(next.text);
  }

  function onKeyDown(
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (e.nativeEvent.isComposing) return;
    if (!showMenu) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + suggestions.length) % suggestions.length,
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const name = suggestions[activeIndex] ?? suggestions[0];
      if (name) insert(name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
    }
  }

  const controlProps = {
    id,
    value,
    placeholder,
    "aria-invalid": invalid || undefined,
    spellCheck: false as const,
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-expanded": showMenu,
    "aria-controls": listId,
    "aria-activedescendant": showMenu
      ? `${listId}-${activeIndex}`
      : undefined,
    onChange: (
      e: FormEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const el = e.currentTarget;
      setFocused(true);
      setDismissed(false);
      onChange(el.value);
      readCursor(el);
    },
    onScroll: syncScroll,
    onKeyDown,
    onKeyUp: (
      e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setFocused(true);
      readCursor(e.currentTarget);
    },
    onClick: (
      e: FormEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setFocused(true);
      setDismissed(false);
      readCursor(e.currentTarget);
    },
    onSelect: (
      e: FormEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setFocused(true);
      readCursor(e.currentTarget);
    },
    onFocus: (
      e: FormEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setFocused(true);
      setDismissed(false);
      readCursor(e.currentTarget);
    },
    onBlur: () => setFocused(false),
  };

  const padding = multiline ? "py-2" : "py-1";
  const wrap = multiline
    ? "whitespace-pre-wrap break-words"
    : "whitespace-pre";
  const surface = cn(
    FIELD,
    padding,
    wrap,
    "placeholder:text-muted-foreground",
  );

  return (
    <div className={cn("relative", showMenu && "z-50")}>
      <div
        className={cn(
          "relative rounded-md border border-input shadow-sm transition-colors",
          "focus-within:outline-none focus-within:ring-1 focus-within:ring-ring",
          dirty && dirtyFieldClass,
          invalid && invalidFieldClass,
          multiline ? "min-h-20" : "h-9",
        )}
      >
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(
            surface,
            "pointer-events-none absolute inset-0 overflow-hidden text-foreground",
          )}
        >
          <HighlightedTemplate value={value} />
          {multiline && value.endsWith("\n") ? "\n" : null}
        </div>
        {multiline ? (
          <textarea
            {...controlProps}
            ref={controlRef as RefObject<HTMLTextAreaElement>}
            rows={rows}
            className={cn(
              surface,
              "relative z-10 block min-h-20 resize-none overflow-hidden text-transparent caret-foreground",
            )}
          />
        ) : (
          <input
            {...controlProps}
            ref={controlRef as RefObject<HTMLInputElement>}
            type="text"
            className={cn(
              surface,
              "relative z-10 h-full overflow-x-auto text-transparent caret-foreground",
            )}
          />
        )}
      </div>
      {showMenu ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((name, index) => (
            <li
              id={`${listId}-${index}`}
              key={name}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "flex cursor-pointer flex-col rounded-sm px-2 py-1.5 text-sm",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(name);
              }}
            >
              <span className="font-mono text-xs">
                {at?.mode === "branch_key" ? name : `{${name}}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {at?.mode === "branch_key"
                  ? branchKeyLabel(name)
                  : TEMPLATE_PLACEHOLDER_LABELS[name as TemplatePlaceholder]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function branchKeyLabel(name: string): string {
  if (isCountBranchKey(name)) return COUNT_BRANCH_LABELS[name];
  return genderLabel(name) ?? name;
}

const ERROR_MARK =
  "text-destructive underline decoration-wavy decoration-destructive underline-offset-2";

function partClass(item: TemplateTokenPart): string {
  if (!item.ok) return ERROR_MARK;
  if (item.kind === "text") return "text-foreground";
  return "text-primary";
}

function HighlightedToken({
  span,
  value,
}: {
  span: TemplatePlaceholderSpan;
  value: string;
}) {
  const token = value.slice(span.start, span.end);
  const asToken = span.known || (span.select && span.closed);
  if (!span.select && !span.known) {
    return <span className={ERROR_MARK}>{token}</span>;
  }
  const inner: ReactNode[] = [];
  let i = span.start;
  for (const item of span.parts) {
    if (item.start === item.end) continue;
    if (item.start > i) {
      inner.push(
        <span key={`g-${i}`}>{value.slice(i, item.start)}</span>,
      );
    }
    inner.push(
      <span key={`p-${item.start}`} className={partClass(item)}>
        {value.slice(item.start, item.end)}
      </span>,
    );
    i = item.end;
  }
  if (i < span.end) {
    inner.push(<span key={`g-${i}`}>{value.slice(i, span.end)}</span>);
  }
  return (
    <span
      className={
        asToken ? "rounded-[2px] bg-primary/10 text-primary" : ERROR_MARK
      }
    >
      {inner}
    </span>
  );
}

function HighlightedTemplate({ value }: { value: string }) {
  const spans = useMemo(() => parseTemplatePlaceholders(value), [value]);
  if (spans.length === 0) return <>{value}</>;
  const parts: ReactNode[] = [];
  let i = 0;
  for (const span of spans) {
    if (span.start > i) {
      parts.push(
        <span key={`t-${i}`}>{value.slice(i, span.start)}</span>,
      );
    }
    parts.push(
      <HighlightedToken key={`s-${span.start}`} span={span} value={value} />,
    );
    i = span.end;
  }
  if (i < value.length) {
    parts.push(<span key={`t-${i}`}>{value.slice(i)}</span>);
  }
  return <>{parts}</>;
}
