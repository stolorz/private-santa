import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Table } from "drizzle-orm";
import {
  deleteAssignmentInEvent,
  getCurrentDraw,
  setAssignmentDelivery,
  updateDrawChannels,
} from "@/lib/pairings";
import { emptyDelivery } from "@/lib/delivery-status";

const GENDER_BLOCK =
  "The link to the reveal page cannot be generated because this guest's gender is not defined.";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  eventLocation,
  eventNameTranslations,
  makeAppSetting,
  makeAssignment,
  makeDraw,
  makeEvent,
  makeEventTemplate,
  makeGuest,
  makePerson,
  makeSeries,
  makeWishlistItem,
  polishNameCases,
} from "@/test/helpers/fixtures";

const { isSignalConfigured } = vi.hoisted(() => ({
  isSignalConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/signal", () => ({
  isSignalConfigured,
  sendBatch: vi.fn(),
}));

import { db } from "@/lib/db";
import { resetSettingsCache } from "@/lib/settings";
import { setTemplates } from "@/lib/templates/reference";
import { useTempTemplateDefaults } from "@/test/helpers/template-defaults";

vi.mock("@/lib/public-path", () => ({
  appBaseUrl: () => "https://santa.test",
  guestPortalUrl: (base: string, token: string) =>
    `${base.replace(/\/+$/, "")}/${token}`,
}));

function recordFromTables(): Table[] {
  const tables: Table[] = [];
  const original = mockDb.db.select.bind(mockDb.db);
  vi.spyOn(mockDb.db, "select").mockImplementation(((
    fields?: Record<string, unknown>,
  ) => {
    const builder = original(fields as never);
    const originalFrom = builder.from.bind(builder);
    builder.from = ((table: Table) => {
      tables.push(table);
      return originalFrom(table as never);
    }) as typeof builder.from;
    return builder;
  }) as typeof mockDb.db.select);
  return tables;
}

function seedCompleteEmailDraw() {
  mockDb.seed(schema.appSetting, [
    makeAppSetting({ key: "email.host", value: "smtp.example.com" }),
    makeAppSetting({ key: "email.user", value: "santa" }),
    makeAppSetting({ key: "email.password", value: "secret" }),
    makeAppSetting({ key: "email.from", value: "santa@example.com" }),
  ]);
  resetSettingsCache();
  mockDb.seed(schema.eventSeries, [makeSeries()]);
  mockDb.seed(schema.event, [
    makeEvent({ ...eventNameTranslations(), ...eventLocation() }),
  ]);
  mockDb.seed(schema.person, [
    makePerson({
      id: 1,
      name: "Ada",
      email: "ada@example.com",
      gender: "female",
      ...polishNameCases("Ada"),
    }),
    makePerson({
      id: 2,
      name: "Bea",
      gender: "male",
      ...polishNameCases("Bea"),
    }),
  ]);
  mockDb.seed(schema.guest, [
    makeGuest({ id: 1, personId: 1 }),
    makeGuest({ id: 2, personId: 2 }),
  ]);
  mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
  mockDb.seed(schema.assignment, [
    makeAssignment({
      id: 1,
      giverId: 1,
      receiverId: 2,
      revealToken: "tok-ada",
    }),
  ]);
}

function seedNames(
  people: Array<{ id: number; name: string; eventId?: number }>,
) {
  mockDb.seed(
    schema.person,
    people.map((p) => makePerson({ id: p.id, name: p.name })),
  );
  mockDb.seed(
    schema.guest,
    people.map((p) =>
      makeGuest({ id: p.id, personId: p.id, eventId: p.eventId ?? 1 }),
    ),
  );
}

describe("pairings", () => {
  describe("getCurrentDraw", () => {
    beforeEach(() => {
      isSignalConfigured.mockReturnValue(false);
    });

    it("counts email and signal guests when those channels are configured", async () => {
      mockDb.seed(schema.appSetting, [
        makeAppSetting({ key: "email.host", value: "smtp.example.com" }),
        makeAppSetting({ key: "email.user", value: "santa" }),
        makeAppSetting({ key: "email.password", value: "secret" }),
        makeAppSetting({ key: "email.from", value: "santa@example.com" }),
      ]);
      resetSettingsCache();
      isSignalConfigured.mockReturnValue(true);
      mockDb.seed(schema.eventSeries, [makeSeries()]);
      mockDb.seed(schema.event, [
        makeEvent({
          ...eventNameTranslations(),
          ...eventLocation(),
          budgetKind: "unlimited",
        }),
      ]);
      mockDb.seed(schema.person, [
        makePerson({
          id: 1,
          name: "Ada",
          email: "ada@example.com",
          phone: "351911111111",
          gender: "female",
          language: "en",
          ...polishNameCases("Ada"),
        }),
      ]);
      mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
      mockDb.seed(schema.draw, [makeDraw()]);
      mockDb.seed(schema.assignment, [
        makeAssignment({ id: 1, giverId: 1, receiverId: 1 }),
      ]);

      const result = await getCurrentDraw(1);

      expect(result?.revealLinks).toHaveLength(1);
    });

    it("returns null without querying assignments when there are no draws", async () => {
      const tables = recordFromTables();
      await expect(getCurrentDraw(1)).resolves.toBeNull();
      expect(tables).toEqual([schema.draw]);
      expect(tables).not.toContain(schema.assignment);
    });

    it("returns the newest draw with guest reveal links", async () => {
      mockDb.seed(schema.draw, [
        makeDraw({
          id: 1,
          name: "Earlier",
          createdAt: new Date("2026-12-20T00:00:00.000Z"),
        }),
        makeDraw({
          id: 2,
          name: "Latest",
          createdAt: new Date("2026-12-22T00:00:00.000Z"),
          executedAt: new Date("2026-12-22T00:01:00.000Z"),
          durationMs: 12,
          attempts: 3,
          relaxedRestrictions: false,
        }),
      ]);
      seedNames([
        { id: 1, name: "Zoe" },
        { id: 2, name: "Ada" },
        { id: 3, name: "Mia" },
      ]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          drawId: 2,
          giverId: 1,
          receiverId: 2,
          revealToken: "tok-zoe",
        }),
        makeAssignment({
          id: 2,
          drawId: 2,
          giverId: 3,
          receiverId: 1,
          revealToken: "tok-mia",
        }),
        makeAssignment({
          id: 3,
          drawId: 2,
          giverId: 2,
          receiverId: 3,
          revealToken: "tok-ada",
        }),
        makeAssignment({
          id: 4,
          drawId: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "old",
        }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.draw.id).toBe(2);
      expect(result?.draw.name).toBe("Latest");
      expect(result?.assignedGiverIds).toEqual([1, 2, 3]);
      expect(result?.assignedReceiverIds).toEqual([1, 2, 3]);
      expect(result?.revealLinks).toEqual([
        {
          giver: "Ada",
          url: "https://santa.test/tok-ada",
          token: "tok-ada",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Mia",
          url: "https://santa.test/tok-mia",
          token: "tok-mia",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Zoe",
          url: "https://santa.test/tok-zoe",
          token: "tok-zoe",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
      ]);
    });

    it("falls back to #id when a guest name is missing", async () => {
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      seedNames([{ id: 1, name: "Ana" }]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          drawId: 1,
          giverId: 77,
          receiverId: 1,
          revealToken: "tok-77",
        }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.revealLinks).toEqual([
        {
          giver: "#77",
          url: "https://santa.test/tok-77",
          token: "tok-77",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason:
            "The link to the reveal page cannot be generated because the following guests have no gender: Ana.",
        },
      ]);
    });

    it("does not include draws from another edition", async () => {
      mockDb.seed(schema.draw, [
        makeDraw({ id: 1, eventId: 1, name: "Family" }),
        makeDraw({
          id: 2,
          eventId: 2,
          name: "Friends",
          createdAt: new Date("2026-12-25T00:00:00.000Z"),
        }),
      ]);
      seedNames([
        { id: 1, name: "Ana", eventId: 1 },
        { id: 2, name: "Bruno", eventId: 1 },
        { id: 3, name: "Cara", eventId: 2 },
        { id: 4, name: "Dan", eventId: 2 },
      ]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          drawId: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "fam",
        }),
        makeAssignment({
          id: 2,
          drawId: 2,
          giverId: 3,
          receiverId: 4,
          revealToken: "fr",
        }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.draw.name).toBe("Family");
      expect(result?.revealLinks).toEqual([
        {
          giver: "Ana",
          url: "https://santa.test/fam",
          token: "fam",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
      ]);
    });

    it("returns empty revealLinks when the draw has no assignments", async () => {
      mockDb.seed(schema.draw, [
        makeDraw({
          id: 1,
          status: "completed",
        }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.draw.id).toBe(1);
      expect(result?.revealLinks).toEqual([]);
      expect(result?.assignedGiverIds).toEqual([]);
      expect(result?.assignedReceiverIds).toEqual([]);
    });

    it("flags opened and revealed from openedAt and revealCount", async () => {
      const openedAt = new Date("2026-12-24T12:00:00.000Z");
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      seedNames([
        { id: 1, name: "Ada" },
        { id: 2, name: "Bea" },
        { id: 3, name: "Mia" },
        { id: 4, name: "Zoe" },
      ]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "tok-ada",
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 3,
          revealToken: "tok-bea",
          openedAt,
        }),
        makeAssignment({
          id: 3,
          giverId: 3,
          receiverId: 4,
          revealToken: "tok-mia",
          openedAt,
          revealCount: 1,
        }),
        makeAssignment({
          id: 4,
          giverId: 4,
          receiverId: 1,
          revealToken: "tok-zoe",
          revealCount: 1,
        }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.revealLinks).toEqual([
        {
          giver: "Ada",
          url: "https://santa.test/tok-ada",
          token: "tok-ada",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Bea",
          url: "https://santa.test/tok-bea",
          token: "tok-bea",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: true,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Mia",
          url: "https://santa.test/tok-mia",
          token: "tok-mia",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: true,
          revealed: true,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Zoe",
          url: "https://santa.test/tok-zoe",
          token: "tok-zoe",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: true,
          revealed: true,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
      ]);
    });

    it("flags own wishlist and match-wishlist seen/unseen/none", async () => {
      const updatedAt = new Date("2026-01-02T00:00:00.000Z");
      const seenAt = new Date("2026-01-03T00:00:00.000Z");
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      mockDb.seed(schema.person, [
        makePerson({ id: 1, name: "Ada" }),
        makePerson({ id: 2, name: "Bea" }),
        makePerson({ id: 3, name: "Mia" }),
      ]);
      mockDb.seed(schema.guest, [
        makeGuest({ id: 1, personId: 1, wishlistUpdatedAt: updatedAt }),
        makeGuest({ id: 2, personId: 2, wishlistUpdatedAt: updatedAt }),
        makeGuest({ id: 3, personId: 3 }),
      ]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "tok-ada",
          revealCount: 1,
          wishlistSeenAt: seenAt,
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 3,
          revealToken: "tok-bea",
          revealCount: 1,
        }),
        makeAssignment({
          id: 3,
          giverId: 3,
          receiverId: 1,
          revealToken: "tok-mia",
        }),
      ]);
      mockDb.seed(schema.wishlistItem, [
        makeWishlistItem({ id: 1, guestId: 1, text: "Ada's book" }),
        makeWishlistItem({ id: 2, guestId: 2, text: "Bea's scarf" }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.revealLinks).toEqual([
        {
          giver: "Ada",
          url: "https://santa.test/tok-ada",
          token: "tok-ada",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: true,
          revealed: true,
          hasWishlist: true,
          matchWishlist: "yes",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Bea",
          url: "https://santa.test/tok-bea",
          token: "tok-bea",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: true,
          revealed: true,
          hasWishlist: true,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Mia",
          url: "https://santa.test/tok-mia",
          token: "tok-mia",
          delivered: emptyDelivery(),
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "no",
          blockedReason: GENDER_BLOCK,
        },
      ]);
    });

    it("leaves the reveal link copyable when guests and the edition are complete", async () => {
      mockDb.seed(schema.eventSeries, [makeSeries()]);
      mockDb.seed(schema.event, [
        makeEvent({ ...eventNameTranslations(), ...eventLocation() }),
      ]);
      mockDb.seed(schema.person, [
        makePerson({
          id: 1,
          name: "Ada",
          gender: "female",
          ...polishNameCases("Ada"),
        }),
        makePerson({
          id: 2,
          name: "Bea",
          gender: "male",
          ...polishNameCases("Bea"),
        }),
      ]);
      mockDb.seed(schema.guest, [
        makeGuest({ id: 1, personId: 1 }),
        makeGuest({ id: 2, personId: 2 }),
      ]);
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "tok-ada",
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "tok-bea",
        }),
      ]);

      const result = await getCurrentDraw(1);

      expect(result?.revealLinks.map((link) => link.blockedReason)).toEqual([
        null,
        null,
      ]);
    });

    it("blocks the reveal link when an edition template does not parse", async () => {
      seedCompleteEmailDraw();
      mockDb.seed(schema.eventTemplate, [
        makeEventTemplate({
          templateId: "reveal.wishlist_empty",
          language: "pl",
          value:
            "{receiver} nie {receiver_gender|female:wpisała|male:wpisał|wpisał(a)} jeszcze żadnych pomysłów na prezent. Zajrzyj tu później.",
        }),
      ]);

      const result = await getCurrentDraw(1);

      expect(result?.revealLinks[0]?.blockedReason).toBe(
        "The link to the reveal page cannot be generated because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
      );
    });

    it("blocks the reveal link from this edition's blank email template", async () => {
      seedCompleteEmailDraw();
      mockDb.seed(schema.eventTemplate, [
        makeEventTemplate({
          templateId: "email.subject",
          language: "en",
          value: " ",
        }),
      ]);

      const result = await getCurrentDraw(1);

      expect(result?.revealLinks[0]?.blockedReason).toBe(
        "The link to the reveal page cannot be generated because the English email template is missing Subject.",
      );
    });

    it("keeps the reveal link copyable when the edition email template is filled", async () => {
      useTempTemplateDefaults();
      await setTemplates({ en: { "email.subject": " " } });
      seedCompleteEmailDraw();
      mockDb.seed(schema.eventTemplate, [
        makeEventTemplate({
          templateId: "email.subject",
          language: "en",
          value: "Edition draw {event}",
        }),
      ]);

      const result = await getCurrentDraw(1);

      expect(result?.revealLinks[0]?.blockedReason).toBeNull();
    });

    it("blocks a complete giver when another seated guest has no gender", async () => {
      mockDb.seed(schema.eventSeries, [makeSeries()]);
      mockDb.seed(schema.event, [makeEvent(eventNameTranslations())]);
      mockDb.seed(schema.person, [
        makePerson({ id: 1, name: "Ada" }),
        makePerson({
          id: 2,
          name: "Bea",
          gender: "female",
          ...polishNameCases("Bea"),
        }),
      ]);
      mockDb.seed(schema.guest, [
        makeGuest({ id: 1, personId: 1 }),
        makeGuest({ id: 2, personId: 2 }),
      ]);
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          giverId: 2,
          receiverId: 1,
          revealToken: "tok-bea",
        }),
      ]);

      const result = await getCurrentDraw(1);

      expect(result?.revealLinks[0]?.blockedReason).toBe(
        "The link to the reveal page cannot be generated because the following guests have no gender: Ada.",
      );
    });

    it("exposes stored delivery flags on each reveal link", async () => {
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      seedNames([
        { id: 1, name: "Ada" },
        { id: 2, name: "Bea" },
      ]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "tok-ada",
          deliveredWhatsapp: true,
          deliveredEmail: true,
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "tok-bea",
          deliveredManual: true,
        }),
      ]);

      const result = await getCurrentDraw(1);
      expect(result?.revealLinks).toEqual([
        {
          giver: "Ada",
          url: "https://santa.test/tok-ada",
          token: "tok-ada",
          delivered: {
            whatsapp: true,
            signal: false,
            email: true,
            manual: false,
          },
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
        {
          giver: "Bea",
          url: "https://santa.test/tok-bea",
          token: "tok-bea",
          delivered: {
            whatsapp: false,
            signal: false,
            email: false,
            manual: true,
          },
          emailFailed: false,
          emailFailedReason: null,
          opened: false,
          revealed: false,
          hasWishlist: false,
          matchWishlist: "none",
          blockedReason: GENDER_BLOCK,
        },
      ]);
    });
  });

  describe("setAssignmentDelivery", () => {
    it("returns null for a token in another edition", async () => {
      mockDb.seed(schema.draw, [makeDraw({ eventId: 1 })]);
      mockDb.seed(schema.assignment, [
        makeAssignment({ revealToken: "tok-ada" }),
      ]);
      await expect(
        setAssignmentDelivery("tok-ada", 2, {
          whatsapp: true,
          signal: false,
          email: false,
          manual: false,
        }),
      ).resolves.toBeNull();
    });

    it("returns null when the update matches no row", async () => {
      mockDb.seed(schema.draw, [makeDraw()]);
      mockDb.seed(schema.assignment, [
        makeAssignment({ revealToken: "tok-ada" }),
      ]);
      vi.spyOn(db, "update").mockReturnValue({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      } as never);
      await expect(
        setAssignmentDelivery("tok-ada", 1, {
          whatsapp: true,
          signal: false,
          email: false,
          manual: false,
        }),
      ).resolves.toBeNull();
    });

    it("updates delivery flags", async () => {
      mockDb.seed(schema.draw, [makeDraw()]);
      mockDb.seed(schema.assignment, [
        makeAssignment({ revealToken: "tok-ada" }),
      ]);
      const updated = await setAssignmentDelivery("tok-ada", 1, {
        whatsapp: true,
        signal: true,
        email: false,
        manual: true,
      });
      expect(updated).toMatchObject({
        deliveredWhatsapp: true,
        deliveredSignal: true,
        deliveredEmail: false,
        deliveredManual: true,
      });
    });
  });

  describe("deleteAssignmentInEvent", () => {
    it("returns null when the token is missing", async () => {
      await expect(deleteAssignmentInEvent("nope", 1)).resolves.toBeNull();
    });

    it("deletes the draw when the last pair is removed", async () => {
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      mockDb.seed(schema.assignment, [
        makeAssignment({ id: 1, revealToken: "tok-ada" }),
      ]);
      await expect(deleteAssignmentInEvent("tok-ada", 1)).resolves.toEqual({
        ok: true,
        drawDeleted: true,
      });
      expect(mockDb.rows(schema.assignment)).toEqual([]);
      expect(mockDb.rows(schema.draw)).toEqual([]);
    });

    it("keeps the draw when another pair remains", async () => {
      mockDb.seed(schema.draw, [makeDraw({ id: 1 })]);
      mockDb.seed(schema.assignment, [
        makeAssignment({
          id: 1,
          giverId: 1,
          receiverId: 2,
          revealToken: "tok-ada",
        }),
        makeAssignment({
          id: 2,
          giverId: 2,
          receiverId: 1,
          revealToken: "tok-bea",
        }),
      ]);
      await expect(deleteAssignmentInEvent("tok-ada", 1)).resolves.toEqual({
        ok: true,
        drawDeleted: false,
      });
      expect(mockDb.rows(schema.assignment)).toHaveLength(1);
      expect(mockDb.rows(schema.draw)).toHaveLength(1);
    });
  });
});

describe("updateDrawChannels", () => {
  it("throws when the draw row is missing", () => {
    expect(() =>
      updateDrawChannels(9, { email: true }),
    ).toThrow("Could not update draw.");
  });

  it("updates only the flags that are provided", () => {
    mockDb.seed(schema.draw, [
      makeDraw({
        deliverWhatsapp: false,
        deliverSignal: true,
        deliverEmail: true,
        allowSelfDraw: false,
        avoidPastPairings: true,
      }),
    ]);
    expect(
      updateDrawChannels(1, {
        whatsapp: true,
        signal: false,
        allowSelfDraw: true,
        avoidPastPairings: false,
      }),
    ).toMatchObject({
      deliverWhatsapp: true,
      deliverSignal: false,
      deliverEmail: true,
      allowSelfDraw: true,
      avoidPastPairings: false,
    });
  });
});
