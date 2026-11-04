"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IntegrationSection } from "@/components/settings/integrations/integration-section";
import {
  useIntegrationSection,
  type IntegrationFormProps,
} from "@/components/settings/integrations/use-integration-section";

export function WhatsAppForm({ view, onSaved }: IntegrationFormProps) {
  const wa = view.whatsapp;
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState(wa.phoneId);
  const [template, setTemplate] = useState(wa.template);
  const [language, setLanguage] = useState(wa.language);
  const { save, clear, busy, saved, error, setSaved } = useIntegrationSection(
    "whatsapp",
    { token, phoneId, template, language },
  );

  function applyWhatsApp(next: typeof wa) {
    setPhoneId(next.phoneId);
    setTemplate(next.template);
    setLanguage(next.language);
    setToken("");
  }

  async function onSubmit(e: FormEvent) {
    const next = await save(e);
    if (!next) return;
    applyWhatsApp(next.whatsapp);
    onSaved(next);
  }

  async function onClear() {
    const next = await clear();
    if (!next) return;
    applyWhatsApp(next.whatsapp);
    onSaved(next);
  }

  return (
    <IntegrationSection
      title="WhatsApp"
      configured={wa.configured}
      description={
        <>
          Meta Cloud API. Template body params are the giver&apos;s name
          {" "}({`{{1}}`}) and the private guest link ({`{{2}}`}).
        </>
      }
    >
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <Field
        id="wa-token"
        label="Access token"
        hint={
          wa.tokenSet
            ? "Leave blank to keep the current token."
            : "From Meta → WhatsApp → API Setup."
        }
      >
        <Input
          id="wa-token"
          type="password"
          autoComplete="off"
          value={token}
          dirty={token !== ""}
          onChange={(e) => {
            setToken(e.target.value);
            setSaved(false);
          }}
          placeholder={wa.tokenSet ? "••••••••" : "EAAG…"}
        />
      </Field>
      <Field id="wa-phone" label="Phone number ID">
        <Input
          id="wa-phone"
          value={phoneId}
          dirty={phoneId !== wa.phoneId}
          onChange={(e) => {
            setPhoneId(e.target.value);
            setSaved(false);
          }}
          placeholder="123456789012345"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="wa-template" label="Template name">
          <Input
            id="wa-template"
            value={template}
            dirty={template !== wa.template}
            onChange={(e) => {
              setTemplate(e.target.value);
              setSaved(false);
            }}
            placeholder="amigo_secreto"
          />
        </Field>
        <Field id="wa-lang" label="Template language">
          <Input
            id="wa-lang"
            value={language}
            dirty={language !== wa.language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setSaved(false);
            }}
            placeholder="pt_PT"
          />
        </Field>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {saved ? "Saved ✓" : busy ? "Saving…" : "Save WhatsApp"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void onClear()}
        >
          Clear
        </Button>
      </div>
    </form>
    </IntegrationSection>
  );
}
