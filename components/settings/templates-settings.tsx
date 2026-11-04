"use client";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { usePublishTemplateErrorCount } from "@/components/settings/template-error-count";
import { TemplatePreview } from "@/components/settings/template-preview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/settings/collapsible-section";
import { TemplateEditor } from "@/components/settings/template-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { languageLabel } from "@/lib/language";
import {
  TEMPLATE_FIELDS,
  TEMPLATE_GROUPS,
  TEMPLATE_ITEMS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_PLACEHOLDERS,
  isWishlistNoticeTemplateId,
  templatesViewWithDefaults,
  type TemplateGroupId,
  type TemplateId,
  type TemplateItemId,
  type TemplateLanguage,
  type TemplatesPatch,
  type TemplatesView,
} from "@/lib/templates/fields";
import {
  invalidTemplateCount,
  invalidTemplatesHeading,
  invalidTemplatesSaveReason,
  templateErrorCounts,
  templateErrorLine,
  templatesViewErrors,
} from "@/lib/templates/validate";

function groupIdForTemplate(id: TemplateId): TemplateGroupId | null {
  const field = TEMPLATE_FIELDS.find((item) => item.id === id);
  const item = TEMPLATE_ITEMS.find((row) => row.id === field?.item);
  return item?.group ?? null;
}

export function TemplatesSettings({
  initial,
  saveUrl,
  restoreDefaults,
}: {
  initial: TemplatesView;
  saveUrl: string;
  restoreDefaults?: TemplatesView;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<TemplateLanguage>("en");
  const [previewItem, setPreviewItem] = useState<{
    id: TemplateItemId;
    label: string;
  } | null>(null);
  const [view, setView] = useState(() => templatesViewWithDefaults(initial));
  const [savedView, setSavedView] = useState(() =>
    templatesViewWithDefaults(initial),
  );
  const [saved, setSaved] = useState(false);
  const saveTemplates = useMutation((patch: TemplatesPatch) =>
    requestJson<TemplatesView>(saveUrl, {
      method: "PUT",
      ...jsonBody(patch),
    }),
  );
  const busy = saveTemplates.busy;
  const error = saveTemplates.error;
  const syntaxErrors = useMemo(() => templatesViewErrors(view), [view]);
  const invalidCount = invalidTemplateCount(syntaxErrors);
  const errorCounts = useMemo(
    () => templateErrorCounts(syntaxErrors),
    [syntaxErrors],
  );
  usePublishTemplateErrorCount(errorCounts.total);
  const openGroups = useMemo(() => {
    const groups = new Set<TemplateGroupId>();
    for (const item of syntaxErrors) {
      if (item.language !== lang) continue;
      const group = groupIdForTemplate(item.id);
      if (group) groups.add(group);
    }
    return groups;
  }, [syntaxErrors, lang]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (syntaxErrors.length > 0) return;
    setSaved(false);
    const result = await saveTemplates.run(patchFromView(view));
    if (!result.ok) return;
    setView(result.data);
    setSavedView(result.data);
    setSaved(true);
    router.refresh();
  }

  function resetLanguage() {
    if (!restoreDefaults) return;
    setView((prev) => ({
      ...prev,
      [lang]: { ...restoreDefaults[lang] },
    }));
    setSaved(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Templates</CardTitle>
        <CardDescription>
          Guests get their copy in their own language. Type {"{"} in any
          field to insert a variable. Name cases such as{" "}
          {"{giver_dopelniacz}"}, {"{receiver_wolacz}"} and{" "}
          {"{event_dopelniacz}"} fall back to {"{giver}"} / {"{receiver}"} /
          the Polish event name when blank. Guests must have a gender
          before they can be saved or invited.{" "}
          {"{giver_gender}"} and {"{receiver_gender}"} are female or male.
          Branch on gender with{" "}
          {"{giver_gender|female:Droga|male:Drogi} {giver_wolacz}"}.{" "}
          {"{guest_count}"} is how many people are in the lottery. Inflect with{" "}
          {
            "{guest_count|1:wzięła udział # osoba|2:wzięły udział # osoby|wzięło udział # osób}"
          }
          , where # is the number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={200}>
          <form onSubmit={save} className="space-y-6">
            <SegmentedTabs
              value={lang}
              onChange={setLang}
              options={TEMPLATE_LANGUAGES.map((code) => ({
                id: code,
                label: languageLabel(code),
                count: errorCounts.byLanguage[code],
              }))}
            />

            {TEMPLATE_GROUPS.map((group) => (
              <CollapsibleSection
                key={group.id}
                title={group.label}
                description={group.description}
                forceOpen={openGroups.has(group.id)}
              >
                {TEMPLATE_ITEMS.filter((item) => item.group === group.id).map(
                  (item) => {
                    const fields = TEMPLATE_FIELDS.filter(
                      (f) => f.item === item.id,
                    );
                    return (
                      <div key={item.id} className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <Label htmlFor={`${lang}-${fields[0]?.id}`}>
                              {item.label}
                            </Label>
                            {"hint" in item ? (
                              <p className="text-xs text-muted-foreground">
                                {item.hint}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            aria-label={`Preview ${item.label}`}
                            onClick={() =>
                              setPreviewItem({ id: item.id, label: item.label })
                            }
                          >
                            <Eye aria-hidden="true" />
                            Preview
                          </Button>
                        </div>
                        {fields.map((field) => {
                          const id = `${lang}-${field.id}`;
                          const value = view[lang][field.id];
                          const invalid = syntaxErrors.some(
                            (item) =>
                              item.language === lang && item.id === field.id,
                          );
                          return (
                            <Tooltip key={id}>
                              <TooltipTrigger asChild>
                                <div>
                                  <TemplateEditor
                                    id={id}
                                    value={value}
                                    placeholder={field.label}
                                    placeholders={
                                      isWishlistNoticeTemplateId(field.id)
                                        ? field.placeholders
                                        : TEMPLATE_PLACEHOLDERS
                                    }
                                    multiline={field.kind === "textarea"}
                                    dirty={value !== savedView[lang][field.id]}
                                    invalid={invalid}
                                    onChange={(next) => {
                                      setSaved(false);
                                      setView((prev) => ({
                                        ...prev,
                                        [lang]: {
                                          ...prev[lang],
                                          [field.id]: next,
                                        },
                                      }));
                                    }}
                                  />
                                </div>
                              </TooltipTrigger>
                              {value ? (
                                <TooltipContent side="top" align="start">
                                  {field.label}
                                </TooltipContent>
                              ) : null}
                            </Tooltip>
                          );
                        })}
                      </div>
                    );
                  },
                )}
              </CollapsibleSection>
            ))}

            {invalidCount > 0 && (
              <div className="space-y-2 text-sm text-destructive">
                <p className="font-medium">
                  {invalidTemplatesHeading(invalidCount)}
                </p>
                <ul className="space-y-1">
                  {syntaxErrors.map((item, index) => (
                    <li
                      key={`${item.language}-${item.id}-${item.token}-${index}`}
                    >
                      {templateErrorLine(item)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={busy || syntaxErrors.length > 0}
              >
                {saved ? "Saved ✓" : busy ? "Saving…" : "Save templates"}
              </Button>
              {restoreDefaults ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={resetLanguage}
                >
                  Reset {languageLabel(lang)} to defaults
                </Button>
              ) : null}
              {invalidCount > 0 ? (
                <p className="text-sm text-destructive">
                  {invalidTemplatesSaveReason(invalidCount)}
                </p>
              ) : null}
            </div>
          </form>
          {previewItem ? (
            <TemplatePreview
              key={previewItem.id}
              itemId={previewItem.id}
              label={previewItem.label}
              view={view}
              initialLanguage={lang}
              onClose={() => setPreviewItem(null)}
            />
          ) : null}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function patchFromView(next: TemplatesView): TemplatesPatch {
  const patch: TemplatesPatch = {};
  for (const code of TEMPLATE_LANGUAGES) {
    patch[code] = { ...next[code] };
  }
  return patch;
}
