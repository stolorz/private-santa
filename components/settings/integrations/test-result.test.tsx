/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import {
  Badge,
  postTest,
  TestResult,
} from "@/components/settings/integrations/test-result";

describe("Badge", () => {
  it("labels configured vs missing integrations", () => {
    const { rerender } = render(<Badge on />);
    expect(screen.getByText("enabled")).toBeTruthy();
    rerender(<Badge on={false} />);
    expect(screen.getByText("not configured")).toBeTruthy();
  });
});

describe("TestResult", () => {
  it("shows success or error copy", () => {
    const { rerender } = render(<TestResult ok="Sent." error={null} />);
    expect(screen.getByText("Sent.")).toBeTruthy();
    rerender(<TestResult ok={null} error="Mailbox down." />);
    expect(screen.getByText("Mailbox down.")).toBeTruthy();
  });
});

describe("postTest", () => {
  it("returns the payload when the test succeeds", async () => {
    requestJson.mockResolvedValue({
      ok: true,
      data: { ok: true },
      error: null,
      status: 200,
    });
    await expect(postTest("/api/settings/integrations/email/test", {})).resolves.toEqual(
      { ok: true },
    );
  });

  it("throws the server error", async () => {
    requestJson.mockResolvedValue({
      ok: false,
      data: null,
      error: "SMTP failed.",
      status: 400,
    });
    await expect(
      postTest("/api/settings/integrations/email/test", {}),
    ).rejects.toThrow("SMTP failed.");
  });
});
