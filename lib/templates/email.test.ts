import { describe, expect, it } from "vitest";
import {
  EMAIL_BANNER_CID,
  emptyTemplatesView,
  plainEmailHtml,
  renderEmail,
} from "@/lib/templates";

function expectJapaneseFonts(html: string, present: boolean) {
  if (present) {
    expect(html).toContain("family=Klee+One");
    expect(html).toContain("family=Zen+Maru+Gothic");
    expect(html).toContain("Zen Maru Gothic");
  } else {
    expect(html).not.toContain("Klee+One");
    expect(html).not.toContain("Klee One");
    expect(html).not.toContain("Zen Maru Gothic");
  }
}

const URL = "https://santa.test/abc";

function customBody(body: string, button = "Open your gift") {
  const view = emptyTemplatesView();
  view.en["email.body"] = body;
  view.en["email.button"] = button;
  view.en["email.subject"] = "Subject {event}";
  return view;
}

describe("renderEmail", () => {
  it("renders default copy as label plus URL in plain text", () => {
    const view = emptyTemplatesView();
    const mail = renderEmail(view, "en", {
      giver: "Ada",
      event: "Office",
      url: URL,
      location: "Katowice",
      budget_line: " The budget is 25 EUR.",
      guest_count: "2",
    });
    expect(mail.subject).toBe(
      "🎁 Office: Find out who you're preparing a present for!",
    );
    expect(mail.text).toBe(
      `Dear Ada,\n\nJust like last year, each of us is bringing a present on Christmas Eve for the person we drew.\n\nThe draw is a secret – only you know who you're preparing a present for, and they won't know it's from you. If there's something you'd love to receive, you can add it to your wishlist as a hint for the person who drew you. To find out who your present is for this year, click the button below.\n\nSee who you're gifting!\n${URL}\n\nIt looks like we'll all be spending Christmas in Katowice, but if someone can't make it, the present can be sent by post.\n\nThe budget is 25 EUR.\n\nIn total, 2 people are taking part this year.\n\nMerry Christmas!\n\nPS If the button doesn't work, open this link: ${URL}`,
    );
    expect(mail.html).toContain("2 people are taking part this year.");
  });

  it("uses Polish defaults", () => {
    const view = emptyTemplatesView();
    const mail = renderEmail(view, "pl", {
      giver: "Ada",
      giver_wolacz: "Ado",
      giver_gender: "female",
      event: "Biuro",
      date_year: "2026",
      location_gdzie: "w Krakowie",
      url: URL,
      budget_line: " Prezent do 25 €.",
      guest_count: "2",
    });
    expect(mail.subject).toBe("🎁 Biuro: Zobacz, kogo wylosowałaś");
    expect(mail.text).toContain("Droga Ado,");
    expect(mail.text).toContain(
      "tak jak co roku, w tę Wigilię każdy przynosi prezent",
    );
    expect(mail.text).toContain("spędzimy Święta wszyscy razem w Krakowie");
    expect(mail.text).toContain("Łącznie w losowaniu biorą udział 2 osoby.");
    expect(mail.text).toContain("Prezent do 25 €.");
    expect(mail.text).toContain(`Zobacz, kogo obdarujesz\n${URL}`);
    expect(mail.text).toContain("Wesołych Świąt!");
    expect(mail.html).toContain(">Droga Ado,</h1>");
  });

  it("drops leading spaces from plain-text lines only", () => {
    const mail = renderEmail(customBody("Hello.\n\n{budget_line}"), "en", {
      budget_line: " \tNo limit.",
    });
    expect(mail.text).toBe("Hello.\n\nNo limit.");
  });

  it("uses German, Spanish, and Japanese defaults", () => {
    const view = emptyTemplatesView();
    const de = renderEmail(view, "de", {
      giver: "Ada",
      giver_gender: "female",
      event: "Büro",
      url: URL,
      location: "Katowice",
      budget_line: " Das Budget beträgt 25 EUR.",
      guest_count: "2",
    });
    expect(de.subject).toBe("🎁 Büro: Wen beschenkst du dieses Jahr?");
    expect(de.text).toContain("Liebe Ada,");
    expect(de.text).toContain(
      "wie jedes Jahr wichteln wir auch diesmal an Heiligabend, und jeder bereitet ein Geschenk für eine ausgeloste Person vor.",
    );
    expect(de.text).toContain("Insgesamt sind 2 Personen dabei.");
    expect(de.text).toContain("Finde heraus, wen du beschenkst!");

    const es = renderEmail(view, "es", {
      giver: "Ada",
      giver_gender: "female",
      event: "Oficina",
      url: URL,
      location: "Katowice",
      guest_count: "2",
    });
    expect(es.subject).toBe("🎁 Oficina: ¿Quién te ha tocado este año?");
    expect(es.text).toContain("Querida Ada:");
    expect(es.text).toContain("volveremos a hacer el amigo invisible en Nochebuena");
    expect(es.text).toContain("En total, participan 2 personas.");
    expect(es.text).toContain("¡Descubre quién te ha tocado!");

    const ja = renderEmail(view, "ja", {
      giver: "Ada",
      event: "オフィス",
      url: URL,
      location: "Katowice",
      guest_count: "2",
    });
    expect(ja.subject).toBe("🎁 オフィス：今年は誰に贈る？");
    expect(ja.text).toContain("Adaさん、こんにちは！");
    expect(ja.text).toContain("今年もクリスマスイブにプレゼント交換をするよ！");
    expect(ja.text).toContain("参加者は全部で2人だよ。");
    expect(ja.text).toContain("プレゼントを贈る相手を見る");
  });

  it("wraps HTML in a winter card with a slate CTA", () => {
    const view = emptyTemplatesView();
    const mail = renderEmail(view, "en", {
      giver: "Ada",
      event: "Office",
      url: URL,
    });
    expect(mail.html).toContain('bgcolor="#47637f"');
    expect(mail.html).toContain("background-color:#47637f");
    expect(mail.html).toContain("background-color:#e6eef6");
    expect(mail.html).toContain("border:1px solid #d6e2ee");
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.html).toContain("See who you're gifting!");
    expect(mail.html).toContain("width:100%");
    expect(mail.html).toContain("margin:24px 0");
    expect(mail.html).toContain('<meta name="color-scheme" content="light only">');
    expect(mail.html).toContain("as a hint for the person who drew you");
    expectJapaneseFonts(mail.html, false);
  });

  it("trims blank blocks and inlines the guest URL", () => {
    const mail = renderEmail(customBody("   \n\nSee {url}\n\n   "), "en", {
      giver: "Ada",
      event: "Office",
      url: URL,
    });
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.html).toContain("See ");
  });

  it("omits Japanese fonts from Polish mail", () => {
    const mail = renderEmail(emptyTemplatesView(), "pl", {
      giver: "Ada",
      event: "Biuro",
      url: URL,
    });
    expectJapaneseFonts(mail.html, false);
  });

  it("loads Japanese fonts for Japanese copy", () => {
    const mail = renderEmail(emptyTemplatesView(), "ja", {
      giver: "Ada",
      event: "オフィス",
      url: URL,
    });
    expectJapaneseFonts(mail.html, true);
  });

  it("loads Japanese fonts when an English template has a Japanese name", () => {
    const mail = renderEmail(customBody("Hi {giver}!\n\n{button}"), "en", {
      giver: "太郎",
      url: URL,
    });
    expect(mail.html).toContain("Hi 太郎!");
    expectJapaneseFonts(mail.html, true);
  });

  it("does not load Japanese fonts for ja copy with no Japanese glyphs", () => {
    const view = emptyTemplatesView();
    view.ja["email.body"] = "Hello {giver}.\n\n{button}";
    view.ja["email.subject"] = "Subject {event}";
    view.ja["email.button"] = "Open";
    const mail = renderEmail(view, "ja", {
      giver: "Ada",
      event: "Office",
      url: URL,
    });
    expectJapaneseFonts(mail.html, false);
  });

  it("loads Japanese fonts in plain HTML only when the text needs them", () => {
    expectJapaneseFonts(plainEmailHtml("Just hello."), false);
    expectJapaneseFonts(plainEmailHtml("こんにちは"), true);
  });

  it("shows the default greeting as the heading", () => {
    const mail = renderEmail(emptyTemplatesView(), "en", {
      giver: "Ada",
      event: "Office",
      url: URL,
    });
    expect(mail.html).toMatch(/<h1[^>]*>Dear Ada,<\/h1>/);
    expect(mail.html).toMatch(/<p[^>]*>Just like last year/);
  });

  it("turns a button-only block into a CTA, not a paragraph", () => {
    const mail = renderEmail(customBody("Hi {giver}!\n\n{button}"), "en", {
      giver: "Ada",
      url: URL,
    });
    expect(mail.html).toContain("Hi Ada!");
    expect(mail.html).toContain('bgcolor="#47637f"');
    expect(mail.html).not.toMatch(/<p[^>]*>Open your gift/);
  });

  it("turns {url} into a text link, not a button", () => {
    const mail = renderEmail(
      customBody("Open {url} please."),
      "en",
      { url: URL },
    );
    expect(mail.html).toContain(
      `<a href="${URL}" style="color:#47637f;text-decoration:underline;">${URL}</a>`,
    );
    expect(mail.html).not.toContain('bgcolor="#47637f"');
    expect(mail.text).toBe(`Open ${URL} please.`);
  });

  it("escapes copy and the button label", () => {
    const mail = renderEmail(
      customBody("A & B <C> {button}", 'Go "now" & <win>'),
      "en",
      { url: URL },
    );
    expect(mail.html).toContain("A &amp; B &lt;C&gt;");
    expect(mail.html).toContain('Go "now" &amp; &lt;win&gt;');
    expect(mail.html).not.toContain("A & B <C>");
  });

  it("escapes the heading", () => {
    const mail = renderEmail(customBody("Hi <b>{giver}</b>\n\nRest."), "en", {
      giver: "A&B",
    });
    expect(mail.html).toMatch(/<h1[^>]*>Hi &lt;b&gt;A&amp;B&lt;\/b&gt;<\/h1>/);
  });

  it("escapes quotes in the href", () => {
    const href = 'https://santa.test/a"b';
    const mail = renderEmail(customBody("{button}"), "en", { url: href });
    expect(mail.html).toContain('href="https://santa.test/a&quot;b"');
  });

  it("renders the first short line as a heading and the rest as paragraphs", () => {
    const mail = renderEmail(customBody("One.\n\nTwo.\n\nThree."), "en", {});
    expect(mail.html).toMatch(/<h1[^>]*>One\.<\/h1>/);
    expect(mail.html.match(/<p /g)).toHaveLength(2);
    expect(mail.html).toContain(">Two.</p>");
    expect(mail.html).toContain(">Three.</p>");
  });

  it("keeps a multi-line or long first block as a paragraph", () => {
    const multi = renderEmail(customBody("One.\nStill one.\n\nTwo."), "en", {});
    expect(multi.html).not.toContain("<h1");
    expect(multi.html.match(/<p /g)).toHaveLength(2);

    const long = renderEmail(customBody(`${"x".repeat(81)}\n\nTwo.`), "en", {});
    expect(long.html).not.toContain("<h1");
    expect(long.html.match(/<p /g)).toHaveLength(2);
  });

  it("turns a single newline into a break inside a paragraph", () => {
    const mail = renderEmail(customBody("One.\nTwo."), "en", {});
    expect(mail.html).toContain("One.<br>Two.");
    expect(mail.html.match(/<p /g)).toHaveLength(1);
  });

  it("does not promote a mixed first block to a heading", () => {
    const mail = renderEmail(customBody("See {url} now.\n\nSecond."), "en", {
      url: URL,
    });
    expect(mail.html).not.toContain("<h1");
    expect(mail.html).toContain("See ");
    expect(mail.html).toContain("Second.");
  });

  it("does not promote a URL-only first block to a heading", () => {
    const mail = renderEmail(customBody("{url}\n\nMore."), "en", { url: URL });
    expect(mail.html).not.toContain("<h1");
    expect(mail.html).toContain("More.");
    expect(mail.html).toContain(`href="${URL}"`);
  });

  it("trims trailing whitespace after a button", () => {
    const mail = renderEmail(customBody("Hi!\n\n{button}   "), "en", {
      url: URL,
    });
    expect(mail.html).toContain('bgcolor="#47637f"');
    expect(mail.html).toContain("Hi!");
  });

  it("still wraps a body with no {button} in the card", () => {
    const mail = renderEmail(customBody("Just hello."), "en", { url: URL });
    expect(mail.html).toContain("Just hello.");
    expect(mail.html).not.toContain("<h1");
    expect(mail.html).toContain("background-color:#e6eef6");
    expect(mail.html).not.toContain('bgcolor="#47637f"');
    expect(mail.text).toBe("Just hello.");
  });

  it("leaves {button} as the label when the URL is missing", () => {
    const mail = renderEmail(customBody("{button}"), "en", {});
    expect(mail.text).toBe("Open your gift");
    expect(mail.html).toContain('href=""');
  });

  it("inlines the winter banner as a CID image", () => {
    const mail = renderEmail(customBody("Hi."), "en", {});
    expect(mail.html).toContain(`src="cid:${EMAIL_BANNER_CID}"`);
  });

  it("swaps in a preview banner and ignores a blank override", () => {
    const preview = renderEmail(customBody("Hi."), "en", {}, {
      bannerSrc: "/email/winter-banner.png",
    });
    expect(preview.html).toContain('src="/email/winter-banner.png"');
    expect(preview.html).not.toContain("cid:");
    const blank = renderEmail(customBody("Hi."), "en", {}, { bannerSrc: "   " });
    expect(blank.html).toContain(`src="cid:${EMAIL_BANNER_CID}"`);
  });

  it("renders a wishlist-change letter from separate field ids", () => {
    const view = emptyTemplatesView();
    const mail = renderEmail(
      view,
      "en",
      { giver: "Ada", event: "Office", url: URL },
      {
        fields: {
          subject: "email.wishlist_added.subject",
          body: "email.wishlist_added.body",
          button: "email.wishlist_button",
        },
      },
    );
    expect(mail.subject).toBe("🎁 Office: Something new on the wishlist");
    expect(mail.text).toContain("Dear Ada,");
    expect(mail.text).toContain("has added something to their wishlist");
    expect(mail.text).toContain("Click the button below to see the updated list.");
    expect(mail.text).toContain(`See the wishlist\n${URL}`);
    expect(mail.text).toContain("Merry Christmas!");
    expect(mail.html).toContain(">Dear Ada,</h1>");
    expect(mail.html).not.toContain("Bea");
  });
});
