/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TemplateErrorCountProvider } from "@/components/settings/template-error-count";
import { emptyTemplatesView } from "@/lib/templates/fields";

const refresh = vi.fn();
const requestJson = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/templates",
  useRouter: () => ({ refresh }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("@/lib/fetch-json", () => ({
  jsonBody: (body: unknown) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));

import { TemplatesSettings } from "@/components/settings/templates-settings";

function panelFor(header: HTMLElement) {
  const id = header.getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}

function ok(data: ReturnType<typeof emptyTemplatesView>) {
  return { ok: true, data, error: null, status: 200 };
}

describe("TemplatesSettings", () => {
  const OriginalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    refresh.mockReset();
    requestJson.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    if (OriginalResizeObserver) {
      vi.stubGlobal("ResizeObserver", OriginalResizeObserver);
    } else {
      vi.unstubAllGlobals();
    }
  });

  it("collapses groups and still saves edits from a closed section", async () => {
    const user = userEvent.setup();
    const saved = emptyTemplatesView();
    saved.en["email.subject"] = "Custom subject";
    requestJson.mockResolvedValue(ok(saved));

    render(
      <TemplatesSettings
        initial={emptyTemplatesView()}
        saveUrl="/api/settings/templates"
      />,
    );

    expect(screen.getByRole("button", { name: "English" }).textContent).toBe(
      "English",
    );
    expect(screen.getByRole("button", { name: "Polish" }).textContent).toBe(
      "Polish",
    );
    expect(
      screen
        .getByRole("button", { name: "English" })
        .querySelector(".text-destructive"),
    ).toBeNull();

    const email = screen.getByRole("button", { name: /Email/ });
    const signal = screen.getByRole("button", { name: /Signal/ });
    expect(email.getAttribute("aria-expanded")).toBe("false");
    expect(signal.getAttribute("aria-expanded")).toBe("false");
    expect(panelFor(email)?.hidden).toBe(true);

    await user.click(email);
    expect(email.getAttribute("aria-expanded")).toBe("true");
    expect(panelFor(email)?.hidden).toBe(false);
    const subject = screen.getByLabelText("Invitation");
    await user.clear(subject);
    await user.type(subject, "Custom subject");
    await user.click(email);
    expect(email.getAttribute("aria-expanded")).toBe("false");
    expect(panelFor(email)?.hidden).toBe(true);
    expect(subject).toHaveProperty("value", "Custom subject");

    await user.click(screen.getByRole("button", { name: "Save templates" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const [, init] = requestJson.mock.calls[0] as [string, { body: string }];
    const patch = JSON.parse(init.body) as { en: { "email.subject": string } };
    expect(patch.en["email.subject"]).toBe("Custom subject");
    expect(subject).toHaveProperty("value", "Custom subject");
  });

  it("keeps a saved email body when initial props go stale", async () => {
    const user = userEvent.setup();
    const initial = emptyTemplatesView();
    const saved = emptyTemplatesView();
    saved.en["email.body"] = "Custom email body";
    requestJson.mockResolvedValue(ok(saved));

    const { rerender } = render(
      <TemplatesSettings initial={initial} saveUrl="/api/settings/templates" />,
    );
    await user.click(screen.getByRole("button", { name: /Email/ }));
    const body = document.getElementById("en-email.body") as HTMLTextAreaElement;
    await user.clear(body);
    await user.type(body, "Custom email body");
    await user.click(screen.getByRole("button", { name: "Save templates" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    expect(body).toHaveProperty("value", "Custom email body");

    rerender(
      <TemplatesSettings
        initial={emptyTemplatesView()}
        saveUrl="/api/settings/templates"
      />,
    );
    expect(document.getElementById("en-email.body")).toHaveProperty(
      "value",
      "Custom email body",
    );
  });

  it("previews the unsaved subject and can switch language", async () => {
    const user = userEvent.setup();
    render(
      <TemplatesSettings
        initial={emptyTemplatesView()}
        saveUrl="/api/settings/templates"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Email/ }));
    const subject = screen.getByLabelText("Invitation");
    await user.clear(subject);
    await user.type(subject, "Hello preview");
    await user.click(screen.getByRole("button", { name: "Preview Invitation" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hello preview")).toBeTruthy();
    const before = within(dialog).getByTestId("preview-sample").textContent;
    await user.click(within(dialog).getByRole("button", { name: "Refresh" }));
    expect(within(dialog).getByTestId("preview-sample").textContent).not.toBe(before);
    await user.click(within(dialog).getByRole("button", { name: "Polish" }));
    expect(
      within(dialog).getByText(/Zobacz, kogo wylosował/),
    ).toBeTruthy();
    expect(requestJson).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides restore on the reference editor", () => {
    render(
      <TemplatesSettings
        initial={emptyTemplatesView()}
        saveUrl="/api/settings/templates"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Reset English to defaults/ }),
    ).toBeNull();
  });

  it("lists giver wishlist-notice fields on email and Signal", async () => {
    const user = userEvent.setup();
    render(
      <TemplatesSettings
        initial={emptyTemplatesView()}
        saveUrl="/api/settings/templates"
      />,
    );
    const email = screen.getByRole("button", { name: /Email/ });
    await user.click(email);
    const emailPanel = panelFor(email)!;
    expect(within(emailPanel).getByLabelText("Wishlist added")).toBeTruthy();
    expect(within(emailPanel).getByLabelText("Wishlist removed")).toBeTruthy();
    expect(within(emailPanel).getByLabelText("Wishlist changed")).toBeTruthy();
    expect(within(emailPanel).getByLabelText("Wishlist button")).toBeTruthy();
    expect(
      within(emailPanel).getAllByText(
        /Do not name the receiver or quote the wish/,
      ).length,
    ).toBeGreaterThan(0);

    const signal = screen.getByRole("button", { name: /Signal/ });
    await user.click(signal);
    expect(
      within(panelFor(signal)!).getByLabelText("Wishlist added"),
    ).toBeTruthy();
  });

  it("resets the current language from the passed-in reference without saving", async () => {
    const user = userEvent.setup();
    const initial = emptyTemplatesView();
    initial.en["email.subject"] = "Edition subject";
    const restoreDefaults = emptyTemplatesView();
    restoreDefaults.en["email.subject"] = "Reference subject {event}";

    render(
      <TemplatesSettings
        initial={initial}
        saveUrl="/api/e/abcdef/templates"
        restoreDefaults={restoreDefaults}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Email/ }));
    const subject = screen.getByLabelText("Invitation");
    expect(subject).toHaveProperty("value", "Edition subject");
    await user.click(
      screen.getByRole("button", { name: "Reset English to defaults" }),
    );
    expect(subject).toHaveProperty("value", "Reference subject {event}");
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("sends the literal field text, including the current default", async () => {
    const user = userEvent.setup();
    const initial = emptyTemplatesView();
    requestJson.mockResolvedValue(ok(initial));
    render(
      <TemplatesSettings
        initial={initial}
        saveUrl="/api/settings/templates"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save templates" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalled());
    const [url, init] = requestJson.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/settings/templates");
    const patch = JSON.parse(init.body) as {
      en: { "email.subject": string };
    };
    expect(patch.en["email.subject"]).toBe(initial.en["email.subject"]);
  });

  it("lists invalid templates, marks the field, and keeps save disabled", async () => {
    const user = userEvent.setup();
    const initial = emptyTemplatesView();
    initial.pl["reveal.wishlist_empty"] =
      "{receiver} nie {receiver_gender|female:wpisała|male:wpisał|wpisał(a)} jeszcze żadnych pomysłów na prezent. Zajrzyj tu później.";

    render(
      <TemplatesSettings
        initial={initial}
        saveUrl="/api/e/abcdef/templates"
        restoreDefaults={emptyTemplatesView()}
      />,
    );

    expect(screen.getByText("1 template is not valid")).toBeTruthy();
    expect(
      screen.getByText(
        "Polish · Their wishlist empty: {receiver_gender} cannot use the fallback \u201cwpisał(a)\u201d. Write female: and male: only.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Save is disabled because 1 template is not valid."),
    ).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save templates" });
    expect(save).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: /Reveal page/ }).getAttribute(
        "aria-expanded",
      ),
    ).toBe("false");

    await user.click(screen.getByRole("button", { name: "Polish (1)" }));
    const reveal = screen.getByRole("button", { name: /Reveal page/ });
    expect(reveal.getAttribute("aria-expanded")).toBe("true");
    expect(panelFor(reveal)?.hidden).toBe(false);
    const field = document.getElementById("pl-reveal.wishlist_empty");
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(field?.parentElement?.className).toContain("border-destructive");
    await user.click(save);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("uses the plural heading when two templates fail", () => {
    const initial = emptyTemplatesView();
    initial.en["email.body"] = "Hi {givre}";
    initial.pl["reveal.wishlist_empty"] =
      "{receiver_gender|female:wpisała|male:wpisał|wpisał(a)}";

    render(
      <TemplatesSettings
        initial={initial}
        saveUrl="/api/settings/templates"
      />,
    );

    expect(screen.getByText("2 templates are not valid")).toBeTruthy();
    expect(
      screen.getByText("Save is disabled because 2 templates are not valid."),
    ).toBeTruthy();
  });

  it("shows live problem counts on the tab and language buttons", () => {
    const initial = emptyTemplatesView();
    initial.en["email.body"] = "Hi {givre} {nope}";
    initial.pl["reveal.wishlist_empty"] =
      "{receiver_gender|female:wpisała|male:wpisał|wpisał(a)}";

    function Harness({ showEditor }: { showEditor: boolean }) {
      return (
        <TemplateErrorCountProvider>
          <SettingsNav />
          {showEditor ? (
            <TemplatesSettings
              initial={initial}
              saveUrl="/api/settings/templates"
            />
          ) : null}
        </TemplateErrorCountProvider>
      );
    }

    const { rerender } = render(<Harness showEditor />);
    const templates = screen.getByRole("link", { name: "Templates 3" });
    expect(templates.querySelector("[data-tab-count]")?.textContent).toBe("3");
    expect(
      screen.getByRole("button", { name: "English (2)" }).querySelector(
        ".text-destructive",
      )?.textContent,
    ).toBe(" (2)");
    expect(screen.getByRole("button", { name: "Polish (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "German" }).textContent).toBe(
      "German",
    );
    expect(screen.getByRole("button", { name: "Spanish" }).textContent).toBe(
      "Spanish",
    );
    expect(screen.getByRole("button", { name: "Japanese" }).textContent).toBe(
      "Japanese",
    );

    rerender(<Harness showEditor={false} />);
    expect(screen.getByRole("link", { name: "Templates" }).textContent).toBe(
      "Templates",
    );
    expect(screen.queryByRole("link", { name: "Templates 3" })).toBeNull();
  });

  it("shows the stored Templates count before the editor opens", () => {
    const initial = emptyTemplatesView();
    initial.en["email.body"] = "Hi {givre} {nope}";
    initial.pl["reveal.wishlist_empty"] =
      "{receiver_gender|female:wpisała|male:wpisał|wpisał(a)}";

    function Harness({ showEditor }: { showEditor: boolean }) {
      return (
        <TemplateErrorCountProvider count={4}>
          <SettingsNav />
          {showEditor ? (
            <TemplatesSettings
              initial={initial}
              saveUrl="/api/settings/templates"
            />
          ) : null}
        </TemplateErrorCountProvider>
      );
    }

    const { rerender } = render(<Harness showEditor={false} />);
    expect(screen.getByRole("link", { name: "Templates 4" })).toBeTruthy();

    rerender(<Harness showEditor />);
    expect(screen.getByRole("link", { name: "Templates 3" })).toBeTruthy();

    rerender(<Harness showEditor={false} />);
    expect(screen.getByRole("link", { name: "Templates 4" })).toBeTruthy();
  });
});
