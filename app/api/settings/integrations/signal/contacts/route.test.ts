import { beforeEach, describe, expect, it, vi } from "vitest";

const { listSignalContacts } = vi.hoisted(() => ({
  listSignalContacts: vi.fn(),
}));
const { isSignalConfigured } = vi.hoisted(() => ({
  isSignalConfigured: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/signal", () => ({
  listSignalContacts,
}));

vi.mock("@/lib/signal-store", () => ({
  isSignalConfigured,
}));

import { NextRequest } from "next/server";
import { GET } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

function contactsRequest(sync = false) {
  const url = new URL(
    sync
      ? "http://localhost/api/settings/integrations/signal/contacts?sync=1"
      : "http://localhost/api/settings/integrations/signal/contacts",
  );
  return new NextRequest(url);
}


describe("GET /api/settings/integrations/signal/contacts", () => {
  beforeEach(async () => {
    await asAdmin();
    isSignalConfigured.mockReset();
    isSignalConfigured.mockReturnValue(true);
    listSignalContacts.mockReset();
    listSignalContacts.mockResolvedValue([
      { id: "+15550101", label: "Alice (+15550101)", number: "+15550101" },
    ]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await GET(contactsRequest());
    expect(res.status).toBe(401);
    expect(listSignalContacts).not.toHaveBeenCalled();
  });

  it("returns 409 when Signal is not linked", async () => {
    isSignalConfigured.mockReturnValue(false);
    const res = await GET(contactsRequest());
    expect(res.status).toBe(409);
    expect(listSignalContacts).not.toHaveBeenCalled();
  });

  it("returns contacts from go-signal", async () => {
    const res = await GET(contactsRequest());
    expect(res.status).toBe(200);
    expect(listSignalContacts).toHaveBeenCalledWith({ sync: false });
    await expect(res.json()).resolves.toEqual({
      contacts: [
        { id: "+15550101", label: "Alice (+15550101)", number: "+15550101" },
      ],
    });
  });

  it("syncs from the phone when requested", async () => {
    const res = await GET(contactsRequest(true));
    expect(res.status).toBe(200);
    expect(listSignalContacts).toHaveBeenCalledWith({ sync: true });
  });

  it("maps list failures to 500", async () => {
    listSignalContacts.mockRejectedValue(new Error("store locked"));
    const res = await GET(contactsRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "store locked" });
  });

  it("maps a non-Error throw to a generic 500", async () => {
    listSignalContacts.mockRejectedValue("nope");
    const res = await GET(contactsRequest());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not list Signal contacts.",
    });
  });
});
