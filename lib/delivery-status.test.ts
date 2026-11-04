import { describe, expect, it } from "vitest";
import {
  anyDelivered,
  deliveryTooltip,
  emptyDelivery,
  matchWishlistStatus,
  revealLinkBlockedReason,
  toRevealLinks,
  type RevealLinkGuest,
} from "@/lib/delivery-status";

describe("matchWishlistStatus", () => {
  it("is none when the match has no items", () => {
    expect(
      matchWishlistStatus(0, new Date("2026-01-02"), new Date("2026-01-01")),
    ).toBe("none");
  });

  it("is yes when seen at or after the last update", () => {
    const updated = new Date("2026-01-02T00:00:00.000Z");
    expect(matchWishlistStatus(1, updated, updated)).toBe("yes");
    expect(
      matchWishlistStatus(1, new Date("2026-01-03T00:00:00.000Z"), updated),
    ).toBe("yes");
  });

  it("is yes when items exist, they have viewed, and updatedAt is missing", () => {
    expect(matchWishlistStatus(2, new Date("2026-01-01"), null)).toBe("yes");
  });

  it("is no when items exist and they have not viewed since the last change", () => {
    expect(matchWishlistStatus(1, null, new Date("2026-01-01"))).toBe("no");
    expect(
      matchWishlistStatus(
        1,
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe("no");
  });
});

describe("toRevealLinks", () => {
  const opts = {
    nameById: new Map([
      [1, "Ada"],
      [2, "Bea"],
    ]),
    wishlistCountByGuestId: new Map<number, number>(),
    wishlistUpdatedAtByGuestId: new Map<number, Date | null>(),
    urlFor: (token: string) => `https://santa.test/${token}`,
  };

  it("sorts by giver name and defaults idle flags", () => {
    expect(
      toRevealLinks(
        [
          { giverId: 2, receiverId: 1, revealToken: "bea" },
          { giverId: 1, receiverId: 2, revealToken: "ada" },
        ],
        opts,
      ),
    ).toEqual([
      {
        giver: "Ada",
        url: "https://santa.test/ada",
        token: "ada",
        delivered: emptyDelivery(),
        emailFailed: false,
        emailFailedReason: null,
        opened: false,
        revealed: false,
        hasWishlist: false,
        matchWishlist: "none",
        blockedReason: null,
      },
      {
        giver: "Bea",
        url: "https://santa.test/bea",
        token: "bea",
        delivered: emptyDelivery(),
        emailFailed: false,
        emailFailedReason: null,
        opened: false,
        revealed: false,
        hasWishlist: false,
        matchWishlist: "none",
        blockedReason: null,
      },
    ]);
  });

  it("flags opened, revealed, own wishlist, and match-wishlist states", () => {
    const updated = new Date("2026-01-02T00:00:00.000Z");
    const seen = new Date("2026-01-03T00:00:00.000Z");
    expect(
      toRevealLinks(
        [
          {
            giverId: 1,
            receiverId: 2,
            revealToken: "ada",
            openedAt: new Date("2026-01-01"),
          },
          {
            giverId: 2,
            receiverId: 1,
            revealToken: "bea",
            revealCount: 1,
            wishlistSeenAt: seen,
          },
        ],
        {
          ...opts,
          wishlistCountByGuestId: new Map([
            [1, 2],
            [2, 1],
          ]),
          wishlistUpdatedAtByGuestId: new Map([
            [1, updated],
            [2, updated],
          ]),
        },
      ),
    ).toEqual([
      {
        giver: "Ada",
        url: "https://santa.test/ada",
        token: "ada",
        delivered: emptyDelivery(),
        emailFailed: false,
        emailFailedReason: null,
        opened: true,
        revealed: false,
        hasWishlist: true,
        matchWishlist: "no",
        blockedReason: null,
      },
      {
        giver: "Bea",
        url: "https://santa.test/bea",
        token: "bea",
        delivered: emptyDelivery(),
        emailFailed: false,
        emailFailedReason: null,
        opened: true,
        revealed: true,
        hasWishlist: true,
        matchWishlist: "yes",
        blockedReason: null,
      },
    ]);
  });

  it("maps email failure onto the reveal link", () => {
    expect(
      toRevealLinks(
        [
          {
            giverId: 1,
            receiverId: 2,
            revealToken: "ada",
            deliveredEmail: true,
            emailFailed: true,
            emailFailedReason: "550 user unknown",
          },
        ],
        opts,
      )[0],
    ).toMatchObject({
      emailFailed: true,
      emailFailedReason: "550 user unknown",
      delivered: expect.objectContaining({ email: true }),
    });
  });

  it("maps per-channel delivery columns onto delivered flags", () => {
    expect(
      toRevealLinks(
        [
          {
            giverId: 1,
            receiverId: 2,
            revealToken: "ada",
            deliveredWhatsapp: true,
            deliveredEmail: true,
          },
          {
            giverId: 2,
            receiverId: 1,
            revealToken: "bea",
            deliveredManual: true,
          },
        ],
        opts,
      ),
    ).toEqual([
      {
        giver: "Ada",
        url: "https://santa.test/ada",
        token: "ada",
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
        blockedReason: null,
      },
      {
        giver: "Bea",
        url: "https://santa.test/bea",
        token: "bea",
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
        blockedReason: null,
      },
    ]);
  });
});

describe("deliveryTooltip", () => {
  it("names none, one, two, and three-plus channels", () => {
    expect(deliveryTooltip(emptyDelivery())).toBe("Not delivered");
    expect(
      deliveryTooltip({
        whatsapp: true,
        signal: false,
        email: false,
        manual: false,
      }),
    ).toBe("Delivered via WhatsApp");
    expect(
      deliveryTooltip({
        whatsapp: true,
        signal: false,
        email: true,
        manual: false,
      }),
    ).toBe("Delivered via WhatsApp and Email");
    expect(
      deliveryTooltip({
        whatsapp: true,
        signal: true,
        email: false,
        manual: true,
      }),
    ).toBe("Delivered via WhatsApp, Signal, and Manual");
  });

  it("appends email failure to the tooltip", () => {
    expect(deliveryTooltip(emptyDelivery(), { emailFailed: true })).toBe(
      "Email delivery failed",
    );
    expect(
      deliveryTooltip(emptyDelivery(), {
        emailFailed: true,
        emailFailedReason: "550 user unknown",
      }),
    ).toBe("Email delivery failed: 550 user unknown");
    expect(
      deliveryTooltip(
        {
          whatsapp: true,
          signal: false,
          email: false,
          manual: false,
        },
        { emailFailed: true },
      ),
    ).toBe("Delivered via WhatsApp. Email delivery failed.");
    expect(
      deliveryTooltip(
        {
          whatsapp: true,
          signal: false,
          email: false,
          manual: false,
        },
        { emailFailed: true, emailFailedReason: "Mailbox full." },
      ),
    ).toBe("Delivered via WhatsApp. Email delivery failed: Mailbox full.");
  });
});

describe("anyDelivered", () => {
  it("is true when at least one channel succeeded", () => {
    expect(anyDelivered(emptyDelivery())).toBe(false);
    expect(
      anyDelivered({
        whatsapp: false,
        signal: false,
        email: false,
        manual: true,
      }),
    ).toBe(true);
  });
});

const translations = {
  namePl: "Święta",
  nameDe: "Weihnachten",
  nameEs: "Navidad",
  nameJa: "クリスマス",
  location: "Katowice",
  locationGdzie: "w Katowicach",
};

function guest(
  id: number,
  name: string,
  extra: Partial<RevealLinkGuest> = {},
): RevealLinkGuest {
  return {
    id,
    name,
    gender: "female",
    nameDopelniacz: name,
    nameCelownik: name,
    nameBiernik: name,
    nameNarzednik: name,
    nameMiejscownik: name,
    nameWolacz: name,
    ...extra,
  };
}

describe("revealLinkBlockedReason", () => {
  it("hides the link when this guest has no gender", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada", { gender: null }), guest(2, "Bea")],
        event: translations,
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because this guest's gender is not defined.",
    );
  });

  it("names this guest's missing Polish cases", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada", { nameWolacz: null }), guest(2, "Bea")],
        event: translations,
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because this guest is missing Polish cases: Wołacz.",
    );
  });

  it("blocks a complete guest when someone else has no gender", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 2,
        guests: [guest(1, "Ada", { gender: null }), guest(2, "Bea")],
        event: translations,
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because the following guests have no gender: Ada.",
    );
  });

  it("blocks a complete guest when someone else is missing a Polish case", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 2,
        guests: [guest(1, "Ada", { nameBiernik: "" }), guest(2, "Bea")],
        event: translations,
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because the following guests have at least one missing Polish conjugation: Ada.",
    );
  });

  it("blocks every guest when the edition is missing a translation", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada"), guest(2, "Bea")],
        event: { ...translations, nameDe: "  " },
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because the event is missing name translations: German.",
    );
  });

  it("blocks every guest when the edition has no location", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada"), guest(2, "Bea")],
        event: { ...translations, locationGdzie: " " },
        missingEmailTemplateReason:
          "Cannot send email invitations because the Polish email template is missing Subject.",
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because the event is missing its location: Polish phrase (gdzie?).",
    );
  });

  it("blocks every guest when an edition template does not parse", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada"), guest(2, "Bea")],
        event: translations,
        invalidTemplatesReason:
          "Cannot send invitations because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
        missingEmailTemplateReason:
          "Cannot send email invitations because the Polish email template is missing Subject.",
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because 1 template is not valid: Polish Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
    );
  });

  it("uses the email template refusal when that channel would send", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada")],
        event: translations,
        missingEmailTemplateReason:
          "Cannot send email invitations because the Polish email template is missing Subject.",
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because the Polish email template is missing Subject.",
    );
  });

  it("uses the Signal template refusal when email templates are present", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada")],
        event: translations,
        missingEmailTemplateReason: null,
        missingSignalTemplateReason:
          "Cannot send Signal invitations because the Japanese Signal template is missing Message.",
      }),
    ).toBe(
      "The link to the reveal page cannot be generated because the Japanese Signal template is missing Message.",
    );
  });

  it("returns null when the guest and the edition are complete", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada")],
        event: translations,
        missingEmailTemplateReason: null,
        missingSignalTemplateReason: null,
      }),
    ).toBeNull();
  });

  it("does not treat a past party date as a reason to hide the link", () => {
    expect(
      revealLinkBlockedReason({
        giverId: 1,
        guests: [guest(1, "Ada")],
        event: translations,
      }),
    ).toBeNull();
  });
});
