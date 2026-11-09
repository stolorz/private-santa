import { afterEach, describe, expect, it, vi } from "vitest";
import { isReservedFirstSegment, REVEAL_TOKEN_RE } from "@/lib/ids";
import {
  emptyTemplatesView,
  TEMPLATE_DEFAULTS,
  TEMPLATE_ITEMS,
  TEMPLATE_LANGUAGES,
} from "./fields";
import {
  buildEmailPreview,
  buildPushPreview,
  buildRevealPreview,
  buildSignalPreview,
  pickPreviewSample,
  PREVIEW_PORTAL_URL,
  PREVIEW_REVEAL_TOKEN,
  previewBannerUrl,
  previewBudgetLabel,
  previewInvitationVars,
  previewPhotoUrl,
  previewSurface,
  type PreviewSample,
} from "./preview";
import { PREVIEW_EVENTS } from "./preview-fixtures";
import { invitationVars } from "./vars";

const LEFTOVER = /\{[a-z0-9_]+(?:\|[^}]*)?\}/;

function sampleFor(eventId: string, giverId?: string, receiverId?: string): PreviewSample {
  const event = PREVIEW_EVENTS.find((item) => item.id === eventId)!;
  const giver = event.guests.find((guest) => guest.id === (giverId ?? event.guestIds[0]))!;
  const receiver = event.guests.find((guest) => guest.id === (receiverId ?? event.guestIds[1]))!;
  return { event, giver, receiver };
}

function scripted(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("pickPreviewSample", () => {
  it("clamps a wild rng and keeps giver and receiver distinct", () => {
    const sample = pickPreviewSample(scripted([Number.NaN, -1, 1]));
    expect(sample.event.id).toBe(PREVIEW_EVENTS[0]!.id);
    expect(sample.giver.id).toBe(sample.event.guests[0]!.id);
    expect(sample.receiver.id).toBe(sample.event.guests.at(-1)!.id);
    expect(sample.giver.id).not.toBe(sample.receiver.id);
  });

  it("returns the draw when it is not a repeat", () => {
    const first = pickPreviewSample(() => 0);
    const other = pickPreviewSample(() => 0.99);
    expect(other.event.id).not.toBe(first.event.id);
    const again = pickPreviewSample(() => 0, other);
    expect(again.event.id).toBe(first.event.id);
    expect(again.giver.id).toBe(first.giver.id);
  });

  it("advances to another edition when the draw repeats", () => {
    const first = pickPreviewSample(() => 0);
    const next = pickPreviewSample(() => 0, first);
    expect(next.event.id).not.toBe(first.event.id);
    expect(next.giver.id).not.toBe(next.receiver.id);
  });
});

describe("preview urls", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points portraits and the banner at public files", () => {
    expect(previewPhotoUrl(null)).toBeNull();
    expect(previewPhotoUrl(undefined)).toBeNull();
    expect(previewPhotoUrl("  ")).toBeNull();
    expect(previewPhotoUrl("anna.jpg")).toBe("/preview/guests/anna.jpg");
    expect(previewPhotoUrl("a b.jpg")).toBe("/preview/guests/a%20b.jpg");
    expect(previewBannerUrl()).toBe("/email/winter-banner.png");
    expect(PREVIEW_REVEAL_TOKEN).toMatch(REVEAL_TOKEN_RE);
    expect(isReservedFirstSegment(PREVIEW_REVEAL_TOKEN)).toBe(false);
    expect(PREVIEW_PORTAL_URL).toBe("https://santa.example/prevw1");
  });

  it("keeps a configured base path", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/santa");
    expect(previewPhotoUrl("anna.jpg")).toBe("/santa/preview/guests/anna.jpg");
    expect(previewBannerUrl()).toBe("/santa/email/winter-banner.png");
  });
});

describe("preview surfaces", () => {
  it("names each budget choice the way the edition form does", () => {
    expect(previewBudgetLabel("amount")).toBe("Set a budget");
    expect(previewBudgetLabel("zero")).toBe("Make the gift");
    expect(previewBudgetLabel("unlimited")).toBe("No spending limit");
  });

  it("maps every template item onto a guest-facing surface", () => {
    const kinds = new Set<"email" | "signal" | "push" | "reveal">();
    for (const item of TEMPLATE_ITEMS) kinds.add(previewSurface(item.id).kind);
    expect(kinds).toEqual(new Set(["email", "signal", "push", "reveal"]));
    expect(previewSurface("email.budget_line")).toEqual({ kind: "email" });
    expect(previewSurface("signal.message")).toEqual({ kind: "signal" });
    expect(previewSurface("email.wishlist_added")).toEqual({
      kind: "email",
      fields: {
        subject: "email.wishlist_added.subject",
        body: "email.wishlist_added.body",
        button: "email.wishlist_button",
      },
    });
    expect(previewSurface("email.wishlist_button")).toEqual({
      kind: "email",
      fields: {
        subject: "email.wishlist_added.subject",
        body: "email.wishlist_added.body",
        button: "email.wishlist_button",
      },
    });
    expect(previewSurface("email.wishlist_removed")).toEqual({
      kind: "email",
      fields: {
        subject: "email.wishlist_removed.subject",
        body: "email.wishlist_removed.body",
        button: "email.wishlist_button",
      },
    });
    expect(previewSurface("email.wishlist_changed")).toEqual({
      kind: "email",
      fields: {
        subject: "email.wishlist_changed.subject",
        body: "email.wishlist_changed.body",
        button: "email.wishlist_button",
      },
    });
    expect(previewSurface("signal.wishlist_added")).toEqual({
      kind: "signal",
      bodyId: "signal.wishlist_added.body",
    });
    expect(previewSurface("signal.wishlist_removed")).toEqual({
      kind: "signal",
      bodyId: "signal.wishlist_removed.body",
    });
    expect(previewSurface("signal.wishlist_changed")).toEqual({
      kind: "signal",
      bodyId: "signal.wishlist_changed.body",
    });
    expect(previewSurface("push.wishlist_read")).toEqual({
      kind: "push",
      titleId: "push.wishlist_read.title",
      bodyId: "push.wishlist_read.body",
    });
    expect(previewSurface("reveal.unwrap")).toEqual({ kind: "reveal", stage: "wrapped" });
    expect(previewSurface("reveal.unwrap_button")).toEqual({
      kind: "reveal",
      stage: "wrapped",
    });
    expect(previewSurface("reveal.own_wishlist")).toEqual({
      kind: "reveal",
      stage: "unwrapped",
    });
    expect(previewSurface("reveal.previous_years")).toEqual({
      kind: "reveal",
      stage: "unwrapped",
    });
    expect(previewSurface("reveal.photos")).toEqual({
      kind: "reveal",
      stage: "unwrapped",
    });
    expect(previewSurface("reveal.not_found")).toEqual({
      kind: "reveal",
      stage: "not-found",
    });
    expect(previewSurface("reveal.unwrap_error")).toEqual({
      kind: "reveal",
      stage: "error",
    });
  });
});

describe("preview rendering", () => {
  it("uses the same invitation variables as delivery", () => {
    const sample = sampleFor("family");
    expect(previewInvitationVars(TEMPLATE_DEFAULTS, "pl", sample)).toEqual(
      invitationVars(TEMPLATE_DEFAULTS, "pl", {
        giver: sample.giver,
        event: sample.event,
        occursOn: sample.event.occursOn,
        location: {
          location: sample.event.location,
          locationGdzie: sample.event.locationGdzie,
        },
        url: PREVIEW_PORTAL_URL,
        amounts: {
          budgetKind: sample.event.budgetKind,
          budget: sample.event.budget,
          currency: sample.event.currency,
          budgetEur: sample.event.budgetEur,
          budgetPln: sample.event.budgetPln,
          budgetJpy: sample.event.budgetJpy,
        },
        guestCount: sample.event.guestIds.length,
      }),
    );
    expect(
      invitationVars(TEMPLATE_DEFAULTS, "en", {
        giver: sample.giver,
        event: sample.event,
        occursOn: sample.event.occursOn,
        location: null,
        amounts: { budgetKind: "unlimited" },
        guestCount: 2,
      }).url,
    ).toBe("");
  });

  it("renders the Polish invitation letter with the place and the budget", () => {
    const mail = buildEmailPreview(TEMPLATE_DEFAULTS, "pl", sampleFor("family"));
    expect(mail.subject).toBe(
      "🎁 Rodzinne Święta 2026: Zobacz, kogo wylosowałaś",
    );
    expect(mail.text).toBe(
      [
        "Droga Anno Kowalska,",
        "tak jak co roku, w tę Wigilię każdy przynosi prezent dla jednej wylosowanej osoby.",
        "Wynik losowania to tajemnica — tylko Ty wiesz, kogo obdarujesz, a ta osoba nie wie, od kogo dostanie prezent. Jeżeli jest coś, o czym marzysz, możesz dopisać to do swojej listy życzeń jako podpowiedź dla osoby, która Cię wylosowała. Aby sprawdzić, dla kogo przygotowujesz prezent w tym roku, kliknij poniższy przycisk.",
        `Zobacz, kogo obdarujesz\n${PREVIEW_PORTAL_URL}`,
        "Najprawdopodobniej spędzimy Święta wszyscy razem w Katowicach, ale gdyby ktoś nie mógł przyjechać, prezent możesz po prostu wysłać pocztą.",
        "Tegoroczny limit wydatków to 50\u00A0€ (220\u00A0zł), ale prezent można też zrobić własnoręcznie.",
        "Łącznie w losowaniu bierze udział 6 osób.",
        "Wesołych Świąt!\n\nPS Jeżeli przycisk nie działa, otwórz ten link: " +
          PREVIEW_PORTAL_URL,
      ].join("\n\n"),
    );
    expect(mail.html).toContain(">Droga Anno Kowalska,</h1>");
    expect(mail.html).toContain(
      "Tegoroczny limit wydatków to 50\u00A0€ (220\u00A0zł)",
    );

    expect(
      buildEmailPreview(TEMPLATE_DEFAULTS, "pl", sampleFor("valentine")).text,
    ).toContain("spędzimy Święta wszyscy razem u babci");
    expect(
      buildEmailPreview(TEMPLATE_DEFAULTS, "pl", sampleFor("valentine")).text,
    ).toContain("Łącznie w losowaniu biorą udział 2 osoby.");
    expect(
      buildEmailPreview(TEMPLATE_DEFAULTS, "pl", sampleFor("children")).text,
    ).toContain(
      "W tym roku prezenty robimy własnoręcznie, bez wydawania pieniędzy.",
    );
    expect(
      buildEmailPreview(TEMPLATE_DEFAULTS, "pl", sampleFor("summer")).text,
    ).toContain("Łącznie w losowaniu bierze udział 12 osób.");
    expect(
      buildEmailPreview(TEMPLATE_DEFAULTS, "pl", sampleFor("summer")).text,
    ).toContain("W tym roku nie ma limitu wydatków.");
  });

  it("fills {location} and {location_gdzie} from the edition", () => {
    const vars = previewInvitationVars(
      TEMPLATE_DEFAULTS,
      "pl",
      sampleFor("family"),
    );
    expect(vars.location).toBe("Katowice");
    expect(vars.location_gdzie).toBe("w Katowicach");
  });

  it("fills default invitation copy for every budget choice", () => {
    const family = sampleFor("family");
    const office = sampleFor("office");
    const alpine = sampleFor("alpine");
    const children = sampleFor("children");
    const amigo = sampleFor("amigo");
    const summer = sampleFor("summer");
    const valentine = sampleFor("valentine");

    const familyMail = buildEmailPreview(TEMPLATE_DEFAULTS, "en", family);
    expect(familyMail.subject).toContain("Family Christmas 2026");
    expect(familyMail.text).toContain("Anna Kowalska");
    expect(familyMail.text).toContain("This year's spending limit");
    expect(familyMail.text).toContain("€");
    expect(familyMail.text).toContain(PREVIEW_PORTAL_URL);
    expect(familyMail.text).not.toMatch(LEFTOVER);
    expect(familyMail.html).toContain("/email/winter-banner.png");
    expect(familyMail.html).not.toContain("cid:");

    expect(buildEmailPreview(TEMPLATE_DEFAULTS, "pl", office).text).toContain("zł");
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "en", children)).toContain(
      "without spending money",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "en", amigo)).toContain(
      "no spending limit",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "pl", valentine)).toContain(
      "biorą udział 2 osoby",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "pl", alpine)).toContain(
      "biorą udział 3 osoby",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "pl", family)).toContain(
      "bierze udział 6 osób",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "pl", summer)).toContain(
      "bierze udział 12 osób",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "en", family)).toContain(
      "Merry Christmas!",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "pl", family)).toContain(
      "kogo wylosowałaś",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "pl", family)).toContain(
      "Wesołych Świąt!",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "de", family)).toContain(
      "Frohe Weihnachten!",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "de", family)).not.toMatch(LEFTOVER);
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "es", family)).toContain(
      "¡Feliz Navidad!",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "es", family)).not.toMatch(LEFTOVER);
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "ja", family)).toContain(
      "メリークリスマス！",
    );
    expect(buildSignalPreview(TEMPLATE_DEFAULTS, "ja", family)).not.toMatch(LEFTOVER);

    const addedSurface = previewSurface("email.wishlist_added");
    expect(addedSurface.kind).toBe("email");
    const addedMail = buildEmailPreview(
      TEMPLATE_DEFAULTS,
      "en",
      family,
      addedSurface.kind === "email" ? addedSurface.fields : undefined,
    );
    expect(addedMail.subject).toBe(
      "🎁 Family Christmas 2026: Something new on the wishlist",
    );
    expect(addedMail.text).toContain("See the wishlist");
    expect(addedMail.text).not.toMatch(LEFTOVER);
    expect(addedMail.text).not.toContain("Piotr");
    const addedSignal = buildSignalPreview(
      TEMPLATE_DEFAULTS,
      "pl",
      family,
      "signal.wishlist_added.body",
    );
    expect(addedSignal).toContain("Anno Kowalska");
    expect(addedSignal).toContain(PREVIEW_PORTAL_URL);
    expect(addedSignal).not.toMatch(LEFTOVER);
    expect(addedSignal).not.toContain("Piotra");

    for (const lang of TEMPLATE_LANGUAGES) {
      for (const kind of ["added", "removed", "changed"] as const) {
        const surface = previewSurface(`email.wishlist_${kind}`);
        expect(surface.kind).toBe("email");
        const mail = buildEmailPreview(
          TEMPLATE_DEFAULTS,
          lang,
          family,
          surface.kind === "email" ? surface.fields : undefined,
        );
        expect(`${mail.subject}\n${mail.text}`).not.toMatch(LEFTOVER);
        expect(mail.text).not.toContain("Piotr");
        expect(
          buildSignalPreview(
            TEMPLATE_DEFAULTS,
            lang,
            family,
            `signal.wishlist_${kind}.body`,
          ),
        ).not.toMatch(LEFTOVER);
      }
    }

    const push = buildPushPreview(TEMPLATE_DEFAULTS, "en", family, {
      titleId: "push.opened.title",
      bodyId: "push.opened.body",
    });
    expect(push.title).toContain("Family Christmas 2026");
    expect(push.body).toBe("Anna Kowalska opened their private link.");
    expect(`${push.title}\n${push.body}`).not.toMatch(LEFTOVER);
    expect(
      buildPushPreview(TEMPLATE_DEFAULTS, "pl", family, {
        titleId: "push.opened.title",
        bodyId: "push.opened.body",
      }).body,
    ).toBe("Anna Kowalska otworzyła swój prywatny link.");
    expect(
      buildPushPreview(TEMPLATE_DEFAULTS, "de", family, {
        titleId: "push.revealed.title",
        bodyId: "push.revealed.body",
      }).body,
    ).toBe("Anna Kowalska hat nachgeschaut, wen sie gezogen hat.");
    expect(
      buildPushPreview(TEMPLATE_DEFAULTS, "es", family, {
        titleId: "push.revealed.title",
        bodyId: "push.revealed.body",
      }).body,
    ).toBe("Anna Kowalska ya ha mirado quién le ha tocado.");
    expect(
      buildPushPreview(TEMPLATE_DEFAULTS, "ja", family, {
        titleId: "push.revealed.title",
        bodyId: "push.revealed.body",
      }).body,
    ).toBe("Anna Kowalskaさんがくじ引きの結果を見ました。");
  });

  it("keeps receiver tokens until unwrap and swaps in the budget sentence", () => {
    const family = sampleFor("family", "anna", "piotr");
    const beforeParty = new Date("2026-12-24T12:00:00.000Z");
    const wrapped = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "pl",
      family,
      "wrapped",
      beforeParty,
    );
    expect(wrapped.match).toBeNull();
    expect(wrapped.copy.revealedTitle).toBe("W tym roku obdarujesz");
    expect(wrapped.copy.revealedName).toBe("{receiver_biernik}");
    expect(wrapped.copy.wishlistHeading).toContain("{receiver_dopelniacz}");
    expect(wrapped.budget).toContain("zł");
    expect(wrapped.copy.budgetLabel).toBe(wrapped.budget);
    expect(wrapped.eventTitle).toBe("Rodzinne Święta 2026");

    const opened = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "pl",
      family,
      "unwrapped",
      beforeParty,
    );
    expect(opened.match?.name).toBe("Piotr Nowak");
    expect(opened.match?.nameDopelniacz).toBe("Piotra Nowaka");
    expect(opened.match?.wishlist.map((item) => item.text)).toEqual(["Słuchawki"]);
    expect(opened.match?.photo).toBe("piotr.jpg");
    expect(opened.ownWishlist).toEqual(["Ciepły szalik", "Książka kucharska"]);
    expect(opened.previousGifts.map((gift) => `${gift.year}:${gift.name}`)).toEqual([
      "2025:Zosia Kowalska",
      "2024:Lucía Fernández",
    ]);
    expect(opened.copy.previousTitle).toBe("Poprzednie lata");
    expect(opened.copy.previousRow).toBe("{year} — {receiver_dopelniacz}");
    expect(opened.copy.photosButton).toBe("Zdjęcia");
    expect(opened.currentPhotoCount).toBe(0);
    expect(opened.showOwnWishlist).toBe(true);
    expect(opened.currentEventCode).toBe("family");
    expect(opened.copy.photosCurrent).toContain("Rodzinnych Świąt 2026");
    const afterParty = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "pl",
      family,
      "unwrapped",
      new Date("2026-12-25T12:00:00.000Z"),
    );
    expect(afterParty.currentPhotoCount).toBe(4);
    expect(afterParty.showOwnWishlist).toBe(false);
    expect(opened.previousGifts.map((gift) => gift.photoCount)).toEqual([6, 0]);
    expect(opened.previousGifts[0]?.eventCode).toBe("fam25a");

    expect(
      buildRevealPreview(TEMPLATE_DEFAULTS, "de", family, "unwrapped").copy
        .revealedTitle,
    ).toBe("Dieses Jahr beschenkst du…");
    expect(
      buildRevealPreview(TEMPLATE_DEFAULTS, "es", family, "unwrapped").copy
        .revealedTitle,
    ).toBe("Este año te toca regalarle a…");
    const jaUnwrapped = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "ja",
      family,
      "unwrapped",
    );
    expect(jaUnwrapped.copy.greeting).toBe("Anna Kowalskaさん、こんにちは！");
    expect(jaUnwrapped.copy.revealedTitle).toBe(
      "今年あなたがプレゼントを贈る相手は…",
    );
    expect(jaUnwrapped.copy.wishlistHeading).toBe(
      "{receiver}のほしいものリスト",
    );
    expect(jaUnwrapped.copy.wishlistEmpty).toBe(
      "{receiver}はまだほしいものを書いていないみたい。またあとでチェックしてみてね！",
    );
    expect(jaUnwrapped.copy.ownWishlistDescription).toContain(
      "ちょっとしたヒント",
    );

    const handmade = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "en",
      sampleFor("children"),
      "unwrapped",
    );
    expect(handmade.budget).toBe("Handmade gift — without spending money.");
    expect(handmade.previousGifts).toEqual([]);

    const tied = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "en",
      {
        ...family,
        event: {
          ...family.event,
          previousGifts: [
            { giverId: "anna", year: 2025, receiverId: "missing" },
            { giverId: "anna", year: 2025, receiverId: "zosia" },
            { giverId: "anna", year: 2025, receiverId: "piotr" },
          ],
        },
      },
      "unwrapped",
    );
    expect(tied.previousGifts.map((gift) => gift.name)).toEqual([
      "Piotr Nowak",
      "Zosia Kowalska",
    ]);
    const openEnded = buildRevealPreview(
      TEMPLATE_DEFAULTS,
      "en",
      sampleFor("amigo"),
      "error",
    );
    expect(openEnded.budget).toBe("No spending limit.");
    expect(openEnded.match).toBeNull();

    const blank = emptyTemplatesView();
    blank.en["reveal.budget_unlimited"] = "  ";
    const hidden = buildRevealPreview(blank, "en", sampleFor("amigo"), "not-found");
    expect(hidden.budget).toBeNull();
    expect(hidden.copy.budgetLabel).toBe("Spending limit: ");
    expect(hidden.stage).toBe("not-found");
  });
});
