# UI

React 19 client components by feature. Pages under `app/(admin)` and
`app/(public)` are thin: load data in RSC, render a feature component.

Client mutations go through `lib/fetch-json.ts` (`requestJson` never throws)
and `hooks/use-mutation.ts` (`busy` / `error` / `run`). Always build URLs
with `apiPath()` / `eventApiPath()` / `revealApiPath()` — see
[architecture.md](architecture.md) `basePath`.

## Feature folders

### `components/event-admin/`

Edition tabs. `admin-nav.tsx` is the tab list. `types.ts` holds shared
view types.

| File | Tab |
|---|---|
| `admin-nav.tsx` | General, Templates, Guests, Exclusions, Draw, Delivery. The Templates tab shows a red count of that edition’s saved template problem lines on every edition tab. The open editor replaces it with the draft count. The tab stays plain when the count is zero |
| `guests-tab.tsx` | Guest list; uses `components/guests/guest-editor`. Collapsed rows show `Gender is required.` until one is set |
| `exclusions-tab.tsx` | Automatic exclusions (self-draw / past pairings, saved on the edition) plus forbidden pairs; `pair-picker.tsx` |
| `draw-tab.tsx` | Run / inspect + guest links; uses the edition automatic exclusions; `draw-confirm-dialog.tsx`. Current draw has an Export CSV link (`draw_results_YYYY.csv`, giver and receiver) |
| `delivery-tab.tsx` | Channel switches + `delivery/send-panel.tsx` |
| `guest-reveal-links.tsx` | Per-guest copy/status (Draw tab). The copy control stays inactive, with a tooltip and no URL, while missing gender, Polish cases, event translations, the event location, or a configured email/Signal template would block invitation send. Local remove/delivery overlays survive a stale `links` refresh |
| `is-popper-open.ts` | Ignore outside-click while a popover is open |

### `components/guests/`

| File | Role |
|---|---|
| `guest-editor/guest-row.tsx` | Inline add/edit row. Collapsed rows show `Gender is required.` when the person has no gender |
| `guest-editor/guest-fields.tsx` | Name, six required Polish cases, phone, email, language, required gender, photo. Save stays disabled until gender and every case are filled. Leaving the new-guest name copies empty gender and Polish cases when every namesake agrees, and does not change phone, email, or language. Attaching an existing person locks phone and email and leaves gender and the cases editable |
| `guest-editor/guest-form-actions.tsx` | Save / cancel |
| `guest-editor/use-guest-draft.ts` | Draft state; dirty fields from `lib/guest-draft.ts` |
| `guest-editor/use-pending-leave.ts` | Block navigation when dirty |
| `guest-editor/unsaved-changes-dialog.tsx` | Confirm leave |
| `guest-avatar.tsx` | Photo or initials |
| `shared-contact.tsx` | Warning when phone/email is shared |
| `same-name-dialog.tsx` | Ask whether a contactless new guest is an existing namesake or a new person |

### `components/reveal/`

Guest portal. `receiver-reveal.tsx` — unwrap animation, then match portrait,
intro line + templated large name (`reveal.revealed_name`), budget, and the
match’s wishlist in a framed box (heading always shown, including
`{receiver}`). After unwrap it also renders `children` (own wishlist) and,
when the giver has past gifts, `previous-years.tsx` at the bottom.
`preview` skips the open / unwrap /
wishlist-seen pings so Settings can show the same card. `onPreviewUnwrap`
reveals that fixture in the preview. `wishlist-editor.tsx` — giver’s own
list. Add / Edit / Save / Cancel / Remove / placeholder copy is built-in
per guest language (`wishlistUiCopy`), not a Settings template. Empty
text is not saved. An empty list shows only the add field. `previous-years.tsx` — quiet card with
`reveal.previous_title` / description / per-row `{year}` + receiver name.

### `components/settings/`

| File | Role |
|---|---|
| `settings-nav.tsx` | Integrations / Templates / Guests / Safety. The Templates tab shows a red count of the saved reference problem lines on every Settings page. The open editor replaces it with the draft count. The tab stays plain when the count is zero |
| `template-error-count.tsx` | Saved problem-line total for the Templates tab. The open editor publishes a draft override and clears it on leave |
| `safety-settings.tsx` | Auth secret status + rotate (never shows the secret) |
| `integrations-settings.tsx` | Orchestrates channel forms. Local view after save; does not copy RSC `initial` back |
| `integrations/{whatsapp,signal,email,push}-form.tsx` | Per-channel config + test send. Apply the PUT body; do not sync from parent props |
| `collapsible-section.tsx` | Expand/collapse chrome (templates + integrations). `forceOpen` keeps a section expanded |
| `integrations/integration-section.tsx` | Shared section chrome |
| `integrations/test-result.tsx` | Last test outcome |
| `templates-settings.tsx` + `template-editor.tsx` | Per-language copy + placeholder autocomplete. Same editor for Settings → Templates (JSON reference, no Restore) and the edition Templates tab (Restore fills the current language from Settings). Local view after save; does not copy RSC `initial` back. Invalid placeholders: counted red summary, problem list, red field border, forced-open group, disabled Save with the reason. Each language button shows a red count of that language’s problem lines, and stays plain when there are none. While this editor is open, its total replaces the saved count on the Templates tab |
| `template-preview.tsx` | Full-screen preview of the unsaved template: invitation or wishlist-change mail, Signal, push, or the reveal page. Language tabs and Refresh pick another fixture guest pair. The reveal button unwraps the fixture locally. The shared wishlist button previews inside the “added” mail |
| `people-settings.tsx` | App-wide people directory. Collapsed rows show `Gender is required.` when the person has no gender |

### `components/events/`

`events-manager.tsx` — series list, create series/edition. Each edition row
shows a red problem count when that edition has problems (`1 problem`,
`2 problems`). A count of zero is left blank.
`event-settings.tsx` — name overlays (Polish, German, Spanish, and Japanese
required; Save stays disabled and names the missing languages), six Polish
cases (required; Save stays disabled and names the missing cases), date
(required; Save stays disabled and explains a missing date), budget choice
(Set a budget, Make the gift, or No spending limit). A stored kind is
selected on open. A positive amount saved before kinds existed opens as
Set a budget. Otherwise Save stays disabled until one is selected. Set a
budget keeps the amount, currency, and FX
conversion. Typing 0 there does not save. Location has two inputs, Place
(`Katowice`) and Polish (gdzie?) (`w Katowicach`), both required; Save stays
disabled, the empty inputs are marked invalid, and the form names the
missing ones.
`push-toggle.tsx` — organiser Web Push subscribe (also used from settings).

### `components/inputs/`

`name-case-inputs.tsx`, `gender-select.tsx`, `language-select.tsx`,
`phone-input.tsx` (wraps `components/reui/phone-input.tsx`),
`existing-person-picker.tsx`, `photo-cropper.tsx` (`react-easy-crop`).
The cropper drags and zooms from 1× to 6× inside a round frame inset
from the stage, and saves a square JPEG up to 1200px.

### `components/layout/`

`page-shell.tsx` (`PageShell`, `CenteredCard`), `page-header.tsx`
(optional `leading` controls sit with the title; `actions` stay on the
right). `tab-nav.tsx` (optional red problem-line count on a tab),
`sign-out-button.tsx`. Sign out is the leading control on `/events` and
Settings, so it sits apart from Settings and Events.

### `components/festive/`

Visual only (excluded from coverage): `winter-page.tsx`, `winter-scene.tsx`,
`festive-atmosphere.tsx`, `festive-motifs.tsx`, `japanese-font-loader.tsx`.

### `components/ui/`

shadcn/Radix primitives (excluded from coverage): button, card, dialog,
input, label, popover, select, switch, tooltip, command, plus app helpers
`confirm-dialog.tsx`, `field.tsx`, `dirty-field.ts`, `segmented-tabs.tsx`,
`status-icon-button.tsx`, `switch-row.tsx`, `local-date-time.tsx`.

## Pages → components

| Page | Renders |
|---|---|
| `/events` | `EventsManager` |
| `/e/[code]/admin` | `EventSettingsForm` |
| `/e/[code]/admin/templates` | `TemplatesSettings` (`restoreDefaults` from Settings JSON) |
| `/e/[code]/admin/guests` | `GuestsTab` |
| `/e/[code]/admin/exclusions` | `ExclusionsTab` |
| `/e/[code]/admin/draw` | `DrawTab` |
| `/e/[code]/admin/delivery` | `DeliveryTab` |
| `/settings/integrations` | `IntegrationsSettings` |
| `/settings/templates` | `TemplatesSettings` |
| `/settings/people` | `PeopleSettings` |
| `/settings/safety` | `SafetySettings` |
| `/{token}` | `ReceiverReveal` (own wishlist as children; previous years after unwrap). Invalid token: JSON reference not-found copy |
| `/login` `/signup` | `CenteredCard` + form (signup shows check-email when `needsVerification`) |

## Client data rules

- `useMutation` surfaces `displayFetchError`; do not `throw` from fetch helpers.
- Photo upload: `postPhoto` (FormData field `file`).
- Dirty guest leave: `use-pending-leave` + `unsaved-changes-dialog`.
- Popovers inside editors: check `isPopperOpen` before treating a click as “click outside”.
