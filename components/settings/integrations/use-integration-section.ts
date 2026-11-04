"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import type { IntegrationsView } from "@/lib/integrations-types";
import { apiPath } from "@/lib/public-path";

export type IntegrationSectionKey = "whatsapp" | "email" | "push";

export type IntegrationFormProps = {
  view: IntegrationsView;
  onSaved: (view: IntegrationsView, refresh?: boolean) => void;
};

export function useIntegrationSection(
  key: IntegrationSectionKey,
  fields: unknown,
) {
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const persist = useCallback(
    (body: Record<string, unknown>) =>
      requestJson<IntegrationsView>(
        apiPath("/api/settings/integrations"),
        { method: "PUT", ...jsonBody(body) },
      ),
    [],
  );
  const { run, busy, error, setError } = useMutation(persist);
  const [saved, setSaved] = useState(false);

  const save = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setSaved(false);
      const result = await run({ [key]: fieldsRef.current });
      if (!result.ok) return null;
      setSaved(true);
      return result.data;
    },
    [key, run],
  );

  const clear = useCallback(async () => {
    const result = await run({ [key]: null });
    if (!result.ok) return null;
    setSaved(false);
    return result.data;
  }, [key, run]);

  return { save, clear, busy, saved, error, setError, setSaved };
}
