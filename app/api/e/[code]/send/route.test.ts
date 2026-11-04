import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { FIXTURE_EVENT_CODE, makeEvent, makeSeries } from "@/test/helpers/fixtures";
import { codeParams, jsonRequest } from "@/test/helpers/request";

const sendInvitations = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/invitation-send", async () => {
  const { InvitationSendError } = await import("@/lib/errors");
  return { InvitationSendError, sendInvitations };
});

import { InvitationSendError } from "@/lib/invitation-send";
import { POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";


describe("POST /api/e/[code]/send", () => {
  beforeEach(async () => {
    await asAdmin();
    sendInvitations.mockReset();
    sendInvitations.mockResolvedValue({
      delivery: { whatsapp: null, signal: null, email: { sent: 1, failed: 0 } },
    });
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/send`, { mode: "pending" }),
      codeParams(),
    );

    expect(res.status).toBe(401);
    expect(sendInvitations).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/send`, { mode: "later" }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid send request.",
    });
    expect(sendInvitations).not.toHaveBeenCalled();
  });

  it("sends pending invitations", async () => {
    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/send`, { mode: "pending" }),
      codeParams(),
    );

    expect(res.status).toBe(200);
    expect(sendInvitations).toHaveBeenCalledWith(1, "pending", undefined);
    await expect(res.json()).resolves.toEqual({
      delivery: { whatsapp: null, signal: null, email: { sent: 1, failed: 0 } },
    });
  });

  it("forwards selected delivery channels", async () => {
    const channels = { whatsapp: false, signal: true, email: true };

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/send`, {
        mode: "resend",
        channels,
      }),
      codeParams(),
    );

    expect(res.status).toBe(200);
    expect(sendInvitations).toHaveBeenCalledWith(1, "resend", channels);
  });

  it("maps InvitationSendError to 400", async () => {
    sendInvitations.mockRejectedValueOnce(
      new InvitationSendError("Invitations can only be sent after the draw has run."),
    );

    const res = await POST(
      jsonRequest(`/api/e/${FIXTURE_EVENT_CODE}/send`, { mode: "resend" }),
      codeParams(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invitations can only be sent after the draw has run.",
    });
  });
});
