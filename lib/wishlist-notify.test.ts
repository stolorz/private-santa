import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeAssignment,
  makeDraw,
  makeEvent,
  makeEventTemplate,
  makeGuest,
  makePerson,
  makeSeries,
  makeUser,
} from "@/test/helpers/fixtures";

const {
  isSignalConfigured,
  sendSignalBatch,
  isEmailConfigured,
  sendEmailBatch,
} = vi.hoisted(() => ({
  isSignalConfigured: vi.fn(() => false),
  sendSignalBatch: vi.fn(
    async (inputs: Array<{ to: string; text?: string }>) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
  ),
  isEmailConfigured: vi.fn(async () => false),
  sendEmailBatch: vi.fn(
    async (
      inputs: Array<{
        to: string;
        subject?: string;
        text?: string;
        html?: string;
        revealToken?: string;
      }>,
    ) => inputs.map((i) => ({ to: i.to, ok: true })),
  ),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/signal", () => ({
  isSignalConfigured,
  sendBatch: sendSignalBatch,
}));

vi.mock("@/lib/email", () => ({
  isEmailConfigured,
  sendEmailBatch,
  clipEmailFailReason: (reason: string) => reason.trim(),
}));

import {
  claimWishlistNotice,
  deliverWishlistNotice,
  notifyGiverOfWishlistChange,
  releaseWishlistNoticeClaim,
} from "@/lib/wishlist-notify";

function seedSantaFor(
  receiver: { id: number; name?: string; gender?: "female" | "male" | null },
  giver: {
    id: number;
    name?: string;
    phone?: string | null;
    email?: string | null;
    language?: string;
    userId?: string | null;
    gender?: "female" | "male" | null;
  },
) {
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [makeEvent({ name: "Office" })]);
  mockDb.seed(schema.draw, [makeDraw()]);
  mockDb.seed(schema.person, [
    makePerson({
      id: giver.id,
      name: giver.name ?? "Ada",
      phone: giver.phone ?? null,
      email: giver.email ?? null,
      language: (giver.language ?? "en") as "en" | "pl" | "de" | "es" | "ja",
      userId: giver.userId ?? null,
      gender: giver.gender === undefined ? "female" : giver.gender,
    }),
    makePerson({
      id: receiver.id,
      name: receiver.name ?? "Bea",
      gender: receiver.gender === undefined ? "female" : receiver.gender,
    }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: giver.id, personId: giver.id }),
    makeGuest({ id: receiver.id, personId: receiver.id }),
  ]);
  mockDb.seed(schema.assignment, [
    makeAssignment({
      giverId: giver.id,
      receiverId: receiver.id,
      revealToken: "ada-token-12",
    }),
  ]);
}

describe("wishlist change notices", () => {
  beforeEach(() => {
    isSignalConfigured.mockReturnValue(false);
    isEmailConfigured.mockResolvedValue(false);
    sendSignalBatch.mockClear();
    sendEmailBatch.mockClear();
    sendSignalBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
    );
    sendEmailBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: true })),
    );
  });

  it("does nothing when there is no guest, draw, or assignment", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 2, name: "Bea" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 2, personId: 2 })]);

    await expect(claimWishlistNotice(99)).resolves.toBeNull();
    await expect(claimWishlistNotice(2)).resolves.toBeNull();

    mockDb.seed(schema.draw, [makeDraw()]);
    await expect(claimWishlistNotice(2)).resolves.toBeNull();
  });

  it("skips a self-draw", async () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [makeDraw()]);
    mockDb.seed(schema.person, [
      makePerson({
        id: 1,
        name: "Ada",
        email: "ada@example.com",
        gender: "female",
      }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
    mockDb.seed(schema.assignment, [
      makeAssignment({
        giverId: 1,
        receiverId: 1,
        revealToken: "self-token-12",
      }),
    ]);
    isEmailConfigured.mockResolvedValue(true);

    await notifyGiverOfWishlistChange(1, "added");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("claims once until the santa looks", async () => {
    seedSantaFor(
      { id: 2 },
      { id: 1, email: "ada@example.com", phone: "48111111111" },
    );
    isEmailConfigured.mockResolvedValue(true);

    const first = await claimWishlistNotice(2);
    expect(first?.token).toEqual(expect.any(String));
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      first?.token,
    );

    await expect(claimWishlistNotice(2)).resolves.toBeNull();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      first?.token,
    );
  });

  it("sends Signal and email when both can be used", async () => {
    seedSantaFor(
      { id: 2 },
      {
        id: 1,
        email: "ada@example.com",
        phone: "48111111111",
        language: "en",
      },
    );
    isEmailConfigured.mockResolvedValue(true);
    isSignalConfigured.mockReturnValue(true);
    const claimed = await claimWishlistNotice(2);
    expect(claimed).not.toBeNull();
    await deliverWishlistNotice(claimed!, "added");

    expect(sendSignalBatch).toHaveBeenCalledTimes(1);
    expect(sendSignalBatch.mock.calls[0]?.[0][0]).toMatchObject({
      to: "48111111111",
      text: expect.stringContaining("added something to their wishlist"),
    });
    expect(sendSignalBatch.mock.calls[0]?.[0][0]?.text).toContain(
      "ada-token-12",
    );
    expect(sendSignalBatch.mock.calls[0]?.[0][0]?.text).not.toContain("Bea");
    expect(sendEmailBatch).toHaveBeenCalledTimes(1);
    expect(sendEmailBatch.mock.calls[0]?.[0][0]).toMatchObject({
      to: "ada@example.com",
      subject: expect.stringContaining("Something new on the wishlist"),
      revealToken: "ada-token-12",
    });
    expect(sendEmailBatch.mock.calls[0]?.[0][0]?.text).toContain(
      "Merry Christmas!",
    );
    expect(sendEmailBatch.mock.calls[0]?.[0][0]?.html).toContain(
      "winter-banner",
    );
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      claimed?.token,
    );
    expect(mockDb.rows(schema.assignment)[0]?.deliveredEmail).toBe(false);
    expect(mockDb.rows(schema.invitationSend)).toHaveLength(0);
  });

  it("keeps the claim when one channel succeeds", async () => {
    seedSantaFor(
      { id: 2 },
      {
        id: 1,
        email: "ada@example.com",
        phone: "48111111111",
      },
    );
    isEmailConfigured.mockResolvedValue(true);
    isSignalConfigured.mockReturnValue(true);
    sendSignalBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: false, error: "offline" })),
    );
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "removed");
    expect(sendEmailBatch).toHaveBeenCalled();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      claimed?.token,
    );
  });

  it("releases the claim when every attempted channel fails", async () => {
    seedSantaFor({ id: 2 }, { id: 1, email: "ada@example.com" });
    isEmailConfigured.mockResolvedValue(true);
    sendEmailBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: false, error: "bounce" })),
    );
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "changed");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
  });

  it("releases the claim when no channel can be used", async () => {
    seedSantaFor({ id: 2 }, { id: 1 });
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "added");
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
  });

  it("skips a channel whose template is blank", async () => {
    seedSantaFor(
      { id: 2 },
      { id: 1, email: "ada@example.com", phone: "48111111111", language: "en" },
    );
    isEmailConfigured.mockResolvedValue(true);
    isSignalConfigured.mockReturnValue(true);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "email.wishlist_button",
        value: "",
      }),
    ]);
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "added");
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(sendSignalBatch).toHaveBeenCalled();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      claimed?.token,
    );
  });

  it("skips Signal when that body is blank and still emails", async () => {
    seedSantaFor(
      { id: 2 },
      { id: 1, email: "ada@example.com", phone: "48111111111" },
    );
    isEmailConfigured.mockResolvedValue(true);
    isSignalConfigured.mockReturnValue(true);
    mockDb.seed(schema.eventTemplate, [
      makeEventTemplate({
        templateId: "signal.wishlist_removed.body",
        value: "   ",
      }),
    ]);
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "removed");
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendEmailBatch).toHaveBeenCalled();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      claimed?.token,
    );
  });

  it("renders English when the giver language has no pack", async () => {
    seedSantaFor(
      { id: 2 },
      { id: 1, email: "ada@example.com", language: "fr" },
    );
    isEmailConfigured.mockResolvedValue(true);
    isSignalConfigured.mockReturnValue(true);
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "added");
    expect(sendSignalBatch).not.toHaveBeenCalled();
    expect(sendEmailBatch.mock.calls[0]?.[0][0]?.subject).toContain(
      "Something new on the wishlist",
    );
  });

  it("uses a linked login mailbox when the person has no email", async () => {
    mockDb.seed(schema.user, [makeUser({ id: "user_ada", email: "login@example.com" })]);
    seedSantaFor(
      { id: 2 },
      { id: 1, email: null, userId: "user_ada" },
    );
    isEmailConfigured.mockResolvedValue(true);
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "added");
    expect(sendEmailBatch.mock.calls[0]?.[0][0]?.to).toBe("login@example.com");
  });

  it("does not clear a newer claim after a stale failure", async () => {
    seedSantaFor({ id: 2 }, { id: 1, email: "ada@example.com" });
    isEmailConfigured.mockResolvedValue(true);
    sendEmailBatch.mockImplementation(async (inputs) =>
      inputs.map((i) => ({ to: i.to, ok: false, error: "timeout" })),
    );
    const first = await claimWishlistNotice(2);
    expect(first).not.toBeNull();
    mockDb.seed(schema.assignment, [
      makeAssignment({
        giverId: 1,
        receiverId: 2,
        revealToken: "ada-token-12",
        wishlistNotifyClaim: "newer-claim",
      }),
    ]);
    await deliverWishlistNotice(first!, "added");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      "newer-claim",
    );
  });

  it("release is a no-op when the token no longer matches", async () => {
    seedSantaFor({ id: 2 }, { id: 1 });
    const claimed = await claimWishlistNotice(2);
    await releaseWishlistNoticeClaim(claimed!.assignmentId, "other-token");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBe(
      claimed?.token,
    );
  });

  it("allows a new notice after the claim is cleared", async () => {
    seedSantaFor({ id: 2 }, { id: 1, email: "ada@example.com" });
    const first = await claimWishlistNotice(2);
    await releaseWishlistNoticeClaim(first!.assignmentId, first!.token);
    const second = await claimWishlistNotice(2);
    expect(second?.token).toEqual(expect.any(String));
    expect(second?.token).not.toBe(first?.token);
  });

  it("sends after the save returns when a notice is claimed", async () => {
    seedSantaFor({ id: 2 }, { id: 1, email: "ada@example.com" });
    isEmailConfigured.mockResolvedValue(true);
    await notifyGiverOfWishlistChange(2, "changed");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toEqual(
      expect.any(String),
    );
    await vi.waitFor(() => expect(sendEmailBatch).toHaveBeenCalled());
    expect(sendEmailBatch.mock.calls[0]?.[0][0]?.subject).toContain(
      "Something changed on the wishlist",
    );
  });

  it("releases the claim when sending throws", async () => {
    seedSantaFor({ id: 2 }, { id: 1, email: "ada@example.com" });
    isEmailConfigured.mockResolvedValue(true);
    sendEmailBatch.mockRejectedValue(new Error("smtp down"));
    const claimed = await claimWishlistNotice(2);
    await deliverWishlistNotice(claimed!, "added");
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
  });

  it("does not claim when the giver or receiver has no gender", async () => {
    isEmailConfigured.mockResolvedValue(true);
    seedSantaFor(
      { id: 2, gender: null },
      { id: 1, email: "ada@example.com", gender: "female" },
    );
    await expect(claimWishlistNotice(2)).resolves.toBeNull();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();

    seedSantaFor(
      { id: 2, gender: "female" },
      { id: 1, email: "ada@example.com", gender: null },
    );
    await expect(claimWishlistNotice(2)).resolves.toBeNull();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
    expect(sendEmailBatch).not.toHaveBeenCalled();
  });

  it("releases the claim when gender is missing at send time", async () => {
    isEmailConfigured.mockResolvedValue(true);
    for (const missing of ["giver", "receiver"] as const) {
      seedSantaFor(
        { id: 2 },
        { id: 1, email: "ada@example.com" },
      );
      const claimed = await claimWishlistNotice(2);
      expect(claimed).not.toBeNull();
      mockDb.seed(schema.person, [
        makePerson({
          id: 1,
          name: "Ada",
          email: "ada@example.com",
          gender: missing === "giver" ? null : "female",
        }),
        makePerson({
          id: 2,
          name: "Bea",
          gender: missing === "receiver" ? null : "female",
        }),
      ]);
      sendEmailBatch.mockClear();
      await deliverWishlistNotice(claimed!, "added");
      expect(sendEmailBatch).not.toHaveBeenCalled();
      expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
    }
  });

  it("releases the claim when the giver or edition is gone", async () => {
    seedSantaFor({ id: 2 }, { id: 1, email: "ada@example.com" });
    isEmailConfigured.mockResolvedValue(true);
    const claimed = await claimWishlistNotice(2);
    mockDb.seed(schema.event, []);
    await deliverWishlistNotice(claimed!, "added");
    expect(sendEmailBatch).not.toHaveBeenCalled();
    expect(mockDb.rows(schema.assignment)[0]?.wishlistNotifyClaim).toBeNull();
  });
});
