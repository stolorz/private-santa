/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { useIntegrationSection } from "@/components/settings/integrations/use-integration-section";

function fakeEvent(): FormEvent {
  return { preventDefault() {} } as FormEvent;
}

describe("useIntegrationSection", () => {
  it("saves and clears a section", async () => {
    const saved = { whatsapp: { configured: true } };
    const cleared = { whatsapp: { configured: false } };
    requestJson
      .mockResolvedValueOnce({ ok: true, data: saved, error: null, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        data: cleared,
        error: null,
        status: 200,
      });
    const { result } = renderHook(() =>
      useIntegrationSection("whatsapp", { token: "x" }),
    );

    let data: unknown;
    await act(async () => {
      data = await result.current.save(fakeEvent());
    });
    expect(data).toEqual(saved);
    expect(result.current.saved).toBe(true);

    await act(async () => {
      data = await result.current.clear();
    });
    expect(data).toEqual(cleared);
    expect(result.current.saved).toBe(false);
  });
});
