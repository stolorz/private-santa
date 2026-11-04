"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Gift, RefreshCw } from "lucide-react";
import { WinterCard, WinterPage } from "@/components/festive/winter-page";
import { ReceiverReveal } from "@/components/reveal/receiver-reveal";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { languageLabel } from "@/lib/language";
import {
  TEMPLATE_LANGUAGES,
  type TemplateItemId,
  type TemplateLanguage,
  type TemplatesView,
} from "@/lib/templates/fields";
import {
  buildEmailPreview,
  buildPushPreview,
  buildRevealPreview,
  buildSignalPreview,
  PREVIEW_REVEAL_TOKEN,
  pickPreviewSample,
  previewBudgetLabel,
  previewPhotoUrl,
  previewSurface,
  type PreviewRevealStage,
  type PreviewSample,
} from "@/lib/templates/preview";

export function TemplatePreview({
  itemId,
  label,
  view,
  initialLanguage,
  initialSample,
  onClose,
}: {
  itemId: TemplateItemId;
  label: string;
  view: TemplatesView;
  initialLanguage: TemplateLanguage;
  /** Tests pin a fixture. The settings page leaves this unset. */
  initialSample?: PreviewSample;
  onClose: () => void;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [sample, setSample] = useState(
    () => initialSample ?? pickPreviewSample(Math.random),
  );
  const surface = previewSurface(itemId);

  function refresh() {
    setSample((current) => pickPreviewSample(Math.random, current));
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0"
        style={{
          top: 0,
          left: 0,
          transform: "none",
          width: "100vw",
          height: "100dvh",
          maxWidth: "none",
          maxHeight: "none",
          borderRadius: 0,
        }}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 pr-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle>{label}</DialogTitle>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </div>
          <SegmentedTabs
            value={language}
            onChange={setLanguage}
            options={TEMPLATE_LANGUAGES.map((code) => ({
              id: code,
              label: languageLabel(code),
            }))}
          />
          <DialogDescription data-testid="preview-sample">
            {sample.giver.name} → {sample.receiver.name} · {sample.event.name} ·{" "}
            {previewBudgetLabel(sample.event.budgetKind)}
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-4">
          <PreviewBody
            label={label}
            surface={surface}
            view={view}
            language={language}
            sample={sample}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  label,
  surface,
  view,
  language,
  sample,
}: {
  label: string;
  surface: ReturnType<typeof previewSurface>;
  view: TemplatesView;
  language: TemplateLanguage;
  sample: PreviewSample;
}) {
  if (surface.kind === "email") {
    const mail = buildEmailPreview(view, language, sample, surface.fields);
    const email = sample.giver.email;
    const to = email
      ? `${sample.giver.name} <${email}>`
      : `${sample.giver.name} (no email address)`;
    return (
      <div className="mx-auto max-w-[640px] overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="space-y-1 border-b bg-[#f6f9fc] px-4 py-3 text-sm text-[#1f3550]">
          <p>
            <span className="text-muted-foreground">To </span>
            {to}
          </p>
          <p>
            <span className="text-muted-foreground">Subject </span>
            <span className="font-medium">{mail.subject}</span>
          </p>
        </div>
        <iframe
          title={`${label} email preview`}
          sandbox=""
          srcDoc={mail.html}
          className="block h-[min(70vh,760px)] w-full border-0 bg-[#e6eef6]"
        />
      </div>
    );
  }

  if (surface.kind === "signal") {
    const phone = sample.giver.phone
      ? `+${sample.giver.phone}`
      : "no phone number";
    return (
      <div className="mx-auto w-full max-w-sm rounded-[2rem] border bg-[#ece7df] p-4 shadow-sm">
        <p className="mb-3 text-center text-xs font-medium text-[#3b4a3f]">
          Signal · {sample.giver.name} · {phone}
        </p>
        <div className="rounded-2xl rounded-bl-md bg-[#47637f] px-3 py-2 text-sm whitespace-pre-wrap text-[#f6f9fc]">
          {buildSignalPreview(view, language, sample, surface.bodyId)}
        </div>
      </div>
    );
  }

  if (surface.kind === "push") {
    const note = buildPushPreview(view, language, sample, surface);
    return (
      <div className="mx-auto w-full max-w-sm rounded-2xl bg-[#1f3550] p-4 text-[#f6f9fc] shadow-sm">
        <p className="text-xs tracking-wide text-[#a9bdd2] uppercase">
          Secret Santa
        </p>
        <p className="mt-1 font-semibold">{note.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-[#e6eef6]">{note.body}</p>
      </div>
    );
  }

  return (
    <RevealPreview
      view={view}
      language={language}
      sample={sample}
      stage={surface.stage}
    />
  );
}

const PREVIEW_UNWRAP_MS = 650;

function RevealPreview({
  view,
  language,
  sample,
  stage,
}: {
  view: TemplatesView;
  language: TemplateLanguage;
  sample: PreviewSample;
  stage: PreviewRevealStage;
}) {
  return (
    <RevealPreviewStage
      key={`${stage}:${sample.event.id}:${sample.giver.id}:${sample.receiver.id}`}
      view={view}
      language={language}
      sample={sample}
      stage={stage}
    />
  );
}

function RevealPreviewStage({
  view,
  language,
  sample,
  stage,
}: {
  view: TemplatesView;
  language: TemplateLanguage;
  sample: PreviewSample;
  stage: PreviewRevealStage;
}) {
  const [phase, setPhase] = useState(stage);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const pending = timer;
    return () => {
      clearTimeout(pending.current);
    };
  }, []);

  function unwrapLocally() {
    clearTimeout(timer.current);
    setPhase("unwrapping");
    timer.current = setTimeout(() => setPhase("unwrapped"), PREVIEW_UNWRAP_MS);
  }

  const preview = buildRevealPreview(view, language, sample, phase);
  const canUnwrap = phase === "wrapped" || phase === "error";
  let page: ReactNode;
  if (phase === "not-found") {
    page = (
      <WinterPage
        contained
        brand={false}
        sprig={false}
        title={preview.copy.notFoundTitle}
        subtitle={preview.copy.notFoundDescription}
      />
    );
  } else {
    page = (
      <WinterPage
        contained
        brand={false}
        sprig={false}
        title={preview.copy.greeting}
        subtitle={preview.eventTitle || undefined}
      >
        <ReceiverReveal
          preview
          previewBusy={phase === "unwrapping"}
          previewError={phase === "error" ? preview.copy.unwrapError : null}
          onPreviewUnwrap={canUnwrap ? unwrapLocally : undefined}
          photoSrc={previewPhotoUrl}
          token={PREVIEW_REVEAL_TOKEN}
          budget={preview.budget}
          copy={preview.copy}
          initiallyRevealed={phase === "unwrapped"}
          initialMatch={preview.match}
          previousGifts={preview.previousGifts}
        >
          <OwnWishlist
            title={preview.copy.ownWishlistTitle}
            description={preview.copy.ownWishlistDescription}
            items={preview.ownWishlist}
          />
        </ReceiverReveal>
      </WinterPage>
    );
  }
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border shadow-sm">
      {page}
    </div>
  );
}

function OwnWishlist({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: readonly string[];
}) {
  return (
    <WinterCard>
      <CardHeader
        className={
          items.length > 0
            ? "px-6 pt-7 pb-4 sm:px-8"
            : "px-6 pt-7 pb-7 sm:px-8"
        }
      >
        <CardTitle className="text-xl text-foreground sm:text-2xl">
          {title}
        </CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      {items.length > 0 ? (
        <CardContent className="px-6 pb-7 sm:px-8">
          <ul className="space-y-2">
            {items.map((text, index) => (
              <li
                key={`${index}-${text}`}
                className="flex items-start gap-3 rounded-xl bg-secondary/70 px-4 py-2.5 text-base"
              >
                <Gift
                  className="mt-0.5 size-4 shrink-0 text-berry"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">{text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </WinterCard>
  );
}
