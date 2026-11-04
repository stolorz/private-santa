"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import type { Event } from "@/lib/db/schema";
import {
  BUDGET_AMOUNT_REQUIRED_MESSAGE,
  CURRENCIES,
  MISSING_BUDGET_CHOICE_MESSAGE,
  ZERO_IS_NOT_A_BUDGET_MESSAGE,
  effectiveBudgetKind,
  formatBudgetAmount,
  isCurrency,
  otherCurrencies,
  parseBudgetAmount,
  type BudgetKind,
  type Currency,
} from "@/lib/budget";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { apiPath } from "@/lib/public-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameCaseInputs } from "@/components/inputs/name-case-inputs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { missingEventDateMessage } from "@/lib/event-date";
import { missingEventLocationMessage } from "@/lib/event-location";
import {
  missingEventNameCasesMessage,
  missingEventTranslationsMessage,
} from "@/lib/event-name";
import {
  OPTIONAL_NAME_CASE_FIELDS,
  nameCaseFormFrom,
  optionalNameCasesFromBody,
  type NameCaseFormValues,
  type OptionalNameCaseField,
} from "@/lib/name-cases";

const CONVERT_MS = 300;

const BUDGET_CHOICES: { id: BudgetKind; label: string }[] = [
  { id: "amount", label: "Set a budget" },
  { id: "zero", label: "Make the gift" },
  { id: "unlimited", label: "No spending limit" },
];

type ExtraAmounts = Record<Currency, string>;

type EventSettingsSnapshot = {
  name: string;
  nameDe: string;
  nameEs: string;
  nameJa: string;
  namePl: string;
  occursOn: string;
  location: string;
  locationGdzie: string;
  budgetKind: BudgetKind | null;
  budget: string;
  currency: Currency;
  extras: ExtraAmounts;
  cases: NameCaseFormValues;
};

function snapshotFromEvent(event: Event): EventSettingsSnapshot {
  return {
    name: event.name,
    nameDe: event.nameDe ?? "",
    nameEs: event.nameEs ?? "",
    nameJa: event.nameJa ?? "",
    namePl: event.namePl ?? "",
    occursOn: event.occursOn,
    location: event.location ?? "",
    locationGdzie: event.locationGdzie ?? "",
    budgetKind: effectiveBudgetKind(event),
    budget: event.budget != null ? String(event.budget) : "",
    currency: isCurrency(event.currency) ? event.currency : "EUR",
    extras: extrasFromEvent(event),
    cases: nameCaseFormFrom(event),
  };
}

function extrasFromEvent(event: Event): ExtraAmounts {
  return {
    EUR: event.budgetEur != null ? (formatBudgetAmount(event.budgetEur) ?? "") : "",
    PLN: event.budgetPln != null ? (formatBudgetAmount(event.budgetPln) ?? "") : "",
    JPY: event.budgetJpy != null ? (formatBudgetAmount(event.budgetJpy) ?? "") : "",
  };
}

function extrasComplete(event: Event): boolean {
  return (
    event.budget != null &&
    event.budgetEur != null &&
    event.budgetPln != null &&
    event.budgetJpy != null
  );
}

function parsedConverted(
  data: unknown,
): Record<Currency, number> | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const out = {} as Record<Currency, number>;
  for (const code of CURRENCIES) {
    const value = row[code];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return null;
    }
    out[code] = value;
  }
  return out;
}

export function EventSettingsForm({ event }: { event: Event }) {
  const router = useRouter();
  const [name, setName] = useState(event.name);
  const [nameDe, setNameDe] = useState(event.nameDe ?? "");
  const [nameEs, setNameEs] = useState(event.nameEs ?? "");
  const [nameJa, setNameJa] = useState(event.nameJa ?? "");
  const [namePl, setNamePl] = useState(event.namePl ?? "");
  const [cases, setCases] = useState(() => nameCaseFormFrom(event));
  const [occursOn, setOccursOn] = useState(event.occursOn);
  const [location, setLocation] = useState(event.location ?? "");
  const [locationGdzie, setLocationGdzie] = useState(
    event.locationGdzie ?? "",
  );
  const [budgetKind, setBudgetKind] = useState<BudgetKind | null>(() =>
    effectiveBudgetKind(event),
  );
  const [budget, setBudget] = useState(
    event.budget != null ? String(event.budget) : "",
  );
  const [currency, setCurrency] = useState<Currency>(
    isCurrency(event.currency) ? event.currency : "EUR",
  );
  const [extras, setExtras] = useState(() => extrasFromEvent(event));
  const [converting, setConverting] = useState(
    event.budget != null && !extrasComplete(event),
  );
  const [fxError, setFxError] = useState<string | null>(null);
  const lastConvertedPrimary = useRef(
    extrasComplete(event) ? `${event.budget}|${event.currency}` : null,
  );
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(() => snapshotFromEvent(event));
  const saveSettings = useMutation((body: Record<string, unknown>) =>
    requestJson(apiPath(`/api/events/${encodeURIComponent(event.code)}`), {
      method: "PATCH",
      ...jsonBody(body),
    }),
  );
  const busy = saveSettings.busy;
  const error = saveSettings.error;

  function markDirty() {
    setSaved(false);
  }

  useEffect(() => {
    if (budgetKind !== "amount") {
      setConverting(false);
      setFxError(null);
      return;
    }
    const trimmed = budget.trim();
    if (trimmed === "") {
      setExtras({ EUR: "", PLN: "", JPY: "" });
      setFxError(null);
      setConverting(false);
      lastConvertedPrimary.current = "";
      return;
    }
    const amount = parseBudgetAmount(trimmed);
    if (amount == null || amount === 0) {
      setConverting(false);
      setFxError(null);
      if (amount === 0) setExtras({ EUR: "", PLN: "", JPY: "" });
      else setFxError("Enter a valid amount.");
      return;
    }
    const key = `${amount}|${currency}`;
    if (lastConvertedPrimary.current === key) {
      setConverting(false);
      return;
    }
    setConverting(true);
    setFxError(null);
    const handle = window.setTimeout(async () => {
      const result = await requestJson<Record<Currency, number>>(
        apiPath(
          `/api/fx/convert?amount=${encodeURIComponent(String(amount))}&currency=${encodeURIComponent(currency)}`,
        ),
      );
      const converted = result.ok ? parsedConverted(result.data) : null;
      if (converted) {
        setExtras({
          EUR: formatBudgetAmount(converted.EUR) ?? "",
          PLN: formatBudgetAmount(converted.PLN) ?? "",
          JPY: formatBudgetAmount(converted.JPY) ?? "",
        });
        lastConvertedPrimary.current = key;
        setFxError(null);
      } else {
        lastConvertedPrimary.current = null;
        setExtras({ EUR: "", PLN: "", JPY: "" });
        setFxError(result.error || "Could not convert the budget.");
      }
      setConverting(false);
    }, CONVERT_MS);
    return () => window.clearTimeout(handle);
  }, [budget, budgetKind, currency]);

  function extraValue(code: Currency): number | null {
    if (code === currency) return parseBudgetAmount(budget);
    return parseBudgetAmount(extras[code]);
  }

  const amountMode = budgetKind === "amount";
  const parsedAmount = amountMode ? parseBudgetAmount(budget) : null;
  const choiceMessage =
    budgetKind == null ? MISSING_BUDGET_CHOICE_MESSAGE : null;
  const amountMessage = !amountMode
    ? null
    : budget.trim() === ""
      ? BUDGET_AMOUNT_REQUIRED_MESSAGE
      : parsedAmount === 0
        ? ZERO_IS_NOT_A_BUDGET_MESSAGE
        : parsedAmount == null
          ? "Enter a valid amount."
          : null;
  const extrasValid =
    !amountMode ||
    (parsedAmount != null &&
      parsedAmount > 0 &&
      CURRENCIES.every((code) => extraValue(code) != null));
  const extrasMessage =
    !amountMode || amountMessage
      ? null
      : (fxError ??
        (extrasValid || converting ? null : "Enter amounts for every currency."));
  const dateMessage = missingEventDateMessage(occursOn);
  const translationMessage = missingEventTranslationsMessage({
    namePl,
    nameDe,
    nameEs,
    nameJa,
  });
  const caseMessage = missingEventNameCasesMessage(cases);
  const locationMessage = missingEventLocationMessage({
    location,
    locationGdzie,
  });
  const canSave =
    !converting &&
    choiceMessage == null &&
    amountMessage == null &&
    extrasValid &&
    extrasMessage == null &&
    dateMessage == null &&
    translationMessage == null &&
    caseMessage == null &&
    locationMessage == null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || budgetKind == null) return;
    setSaved(false);
    const result = await saveSettings.run({
      name: name.trim(),
      nameEn: "",
      nameDe,
      nameEs,
      nameJa,
      namePl,
      occursOn,
      location,
      locationGdzie,
      budgetKind,
      budget: amountMode ? extraValue(currency) : null,
      currency,
      budgetEur: amountMode ? extraValue("EUR") : null,
      budgetPln: amountMode ? extraValue("PLN") : null,
      budgetJpy: amountMode ? extraValue("JPY") : null,
      ...optionalNameCasesFromBody(cases),
    });
    if (!result.ok) return;
    lastConvertedPrimary.current = amountMode
      ? `${extraValue(currency)}|${currency}`
      : "";
    setBaseline({
      name,
      nameDe,
      nameEs,
      nameJa,
      namePl,
      occursOn,
      location,
      locationGdzie,
      budgetKind,
      budget,
      currency,
      extras: { ...extras },
      cases: { ...cases },
    });
    setSaved(true);
    router.refresh();
  }

  const caseDirty = Object.fromEntries(
    OPTIONAL_NAME_CASE_FIELDS.map(({ field }) => [
      field,
      cases[field] !== baseline.cases[field],
    ]),
  ) as Record<OptionalNameCaseField, boolean>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event</CardTitle>
        <CardDescription>
          Name, date, place, and how much guests may spend. Saving needs the
          place and one of the budget choices below. WhatsApp still sends only
          the guest’s name and link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-name">Name (en)</Label>
              <Input
                id="event-name"
                required
                value={name}
                dirty={name !== baseline.name}
                onChange={(e) => {
                  setName(e.target.value);
                  markDirty();
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                required
                aria-invalid={dateMessage != null}
                value={occursOn}
                dirty={occursOn !== baseline.occursOn}
                onChange={(e) => {
                  setOccursOn(e.target.value);
                  markDirty();
                }}
              />
              {dateMessage ? (
                <p className="text-sm text-destructive">{dateMessage}</p>
              ) : null}
            </div>
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="text-sm font-medium">Budget</legend>
              {BUDGET_CHOICES.map((choice) => (
                <label key={choice.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="budget-kind"
                    value={choice.id}
                    checked={budgetKind === choice.id}
                    onChange={() => {
                      setBudgetKind(choice.id);
                      markDirty();
                    }}
                  />
                  {choice.label}
                </label>
              ))}
              {choiceMessage ? (
                <p className="text-sm text-destructive">{choiceMessage}</p>
              ) : null}
              {amountMessage ? (
                <p className="text-sm text-destructive">{amountMessage}</p>
              ) : null}
            </fieldset>
            {amountMode ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-budget">Amount</Label>
              <Input
                id="event-budget"
                type="number"
                min={0}
                step="any"
                placeholder="20"
                value={budget}
                aria-invalid={amountMessage != null}
                dirty={budget !== baseline.budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  markDirty();
                }}
              />
            </div>
            ) : null}
            {amountMode ? (
            <>
            <div className="flex flex-col gap-2">
              <Label>Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (!isCurrency(value)) return;
                  setCurrency(value);
                  markDirty();
                }}
              >
                <SelectTrigger aria-label="Currency" dirty={currency !== baseline.currency}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {parsedAmount != null && parsedAmount > 0
              ? otherCurrencies(currency).map((code) => (
                  <div key={code} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`event-budget-${code.toLowerCase()}`}>
                        {code}
                      </Label>
                      {extrasMessage ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex text-destructive"
                                aria-label={extrasMessage}
                              >
                                <CircleAlert className="size-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{extrasMessage}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>
                    <Input
                      id={`event-budget-${code.toLowerCase()}`}
                      type="number"
                      min={0}
                      step="any"
                      value={extras[code]}
                      disabled={converting}
                      aria-invalid={extrasMessage != null}
                      dirty={extras[code] !== baseline.extras[code]}
                      onChange={(e) => {
                        setExtras((prev) => ({
                          ...prev,
                          [code]: e.target.value,
                        }));
                        setFxError(null);
                        markDirty();
                      }}
                    />
                  </div>
                ))
              : null}
            </>
            ) : null}
          </div>
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Location</h3>
              <p className="text-sm text-muted-foreground">
                The place name is the same in every language, as{" "}
                {"{location}"}. The Polish phrase answers “gdzie?” with its own
                preposition, as {"{location_gdzie}"}: w Katowicach, we Wrocławiu,
                u babci.
              </p>
              {locationMessage ? (
                <p className="text-sm text-destructive">{locationMessage}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-location">Place</Label>
                <Input
                  id="event-location"
                  autoComplete="off"
                  placeholder="Katowice"
                  value={location}
                  aria-invalid={!location.trim()}
                  dirty={location !== baseline.location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-location-gdzie">Polish (gdzie?)</Label>
                <Input
                  id="event-location-gdzie"
                  autoComplete="off"
                  placeholder="w Katowicach"
                  value={locationGdzie}
                  aria-invalid={!locationGdzie.trim()}
                  dirty={locationGdzie !== baseline.locationGdzie}
                  onChange={(e) => {
                    setLocationGdzie(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Translated names</h3>
              <p className="text-sm text-muted-foreground">
                The name above is used for English. Polish, German, Spanish,
                and Japanese names are required, as are the six Polish cases
                such as {"{event_dopelniacz}"}.
              </p>
              {translationMessage ? (
                <p className="text-sm text-destructive">{translationMessage}</p>
              ) : null}
              {caseMessage ? (
                <p className="text-sm text-destructive">{caseMessage}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-name-pl">Polish</Label>
                <Input
                  id="event-name-pl"
                  value={namePl}
                  aria-invalid={!namePl.trim()}
                  dirty={namePl !== baseline.namePl}
                  onChange={(e) => {
                    setNamePl(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-name-de">German</Label>
                <Input
                  id="event-name-de"
                  value={nameDe}
                  aria-invalid={!nameDe.trim()}
                  dirty={nameDe !== baseline.nameDe}
                  onChange={(e) => {
                    setNameDe(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-name-es">Spanish</Label>
                <Input
                  id="event-name-es"
                  value={nameEs}
                  aria-invalid={!nameEs.trim()}
                  dirty={nameEs !== baseline.nameEs}
                  onChange={(e) => {
                    setNameEs(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-name-ja">Japanese</Label>
                <Input
                  id="event-name-ja"
                  value={nameJa}
                  aria-invalid={!nameJa.trim()}
                  dirty={nameJa !== baseline.nameJa}
                  onChange={(e) => {
                    setNameJa(e.target.value);
                    markDirty();
                  }}
                />
              </div>
            </div>
            <NameCaseInputs
              idPrefix="event-name"
              values={cases}
              onChange={(field, value) => {
                setCases((prev) => ({ ...prev, [field]: value }));
                markDirty();
              }}
              disabled={busy}
              dirty={caseDirty}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || !canSave}>
              {busy ? "Saving…" : converting ? "Converting…" : "Save"}
            </Button>
            {saved && (
              <p className="text-sm text-muted-foreground">Saved.</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
