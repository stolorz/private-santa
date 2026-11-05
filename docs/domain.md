# Domain (`lib/`)

Source of truth for behaviour. Tests next to the source are the spec for
edge cases. Invariants: [AGENTS.md](../AGENTS.md).

## Draw

| File | Role |
|---|---|
| `lib/draw.ts` | Pure solver. No DB |
| `lib/draw-history.ts` | Past `giver→receiver` layers, remapped by `personId` |
| `lib/draw-runner.ts` | Persist solve, mint tokens with `allocateUniqueRevealToken` |
| `lib/shorten-reveal-tokens.ts` | On boot, replace a reveal token that is not a safe 6-char id, using `allocateUniqueRevealToken` |
| `lib/draw-summary.ts` | English one-liner for dropped history layers |
| `lib/draw-results-csv.ts` | Pure `giver,receiver` CSV and `draw_results_YYYY.csv` file name |
| `lib/draw-results.ts` | Current-draw archive: newest draw, guest display names |
| `lib/pairings.ts` | Latest draw, reveal links, delivery flags, delete pair |
| `lib/exclusions.ts` | Pure undirected-pair helpers |
| `lib/exclusion-store.ts` | Persist exclusions (`aId <= bId`) |

### Solver (`runDraw`)

1. Hard constraints: exclusions are **symmetric**. Self-draw forbidden unless
   `allowSelfDraw`.
2. Feasibility: every giver must have ≥1 hard-allowed receiver, else
   `"exclusions are too restrictive"`.
3. Soft constraints: `historyLayers` oldest-first. If a giver has no
   candidate **or** complete search fails, **drop the oldest year** and retry.
   Dropping a layer without calling the solver does not increment `attempts`.
4. Search: complete backtracking. At each step pick the giver with fewest
   remaining candidates (MRV), coin-flip ties. Distinct receivers.
5. Bipartite leftover draws: if `options.receivers` is set, givers and
   receivers may be different leftover sets (same length). Default is a
   permutation of one list.

Empty list throws. Full-group permutation needs ≥2 unless self-draw
(then 1→1 is allowed). Result is a total assignment of leftover slots, not
necessarily a single Hamiltonian cycle (manual pairs can break the cycle).

### Persist (`startDraw` / `executeDraw`)

Reuse latest draw row or insert one (budget choice copied from the event; a positive amount with a null kind is stored as `amount`). Automatic
exclusions come from the edition (`allowSelfDraw`, `avoidPastPairings` only
when an earlier edition exists) and are copied onto the draw. Leftover
slots → `runDraw` (history only if `avoidPastPairings`) → insert assignments
with `allocateUniqueRevealToken` (a 6-char id; `revealToken` skips reserved
first segments, then 20 retries skip ids already used on this draw) → stamp
solver stats. UNIQUE constraint errors → `DrawError("Draw changed, retry.")`.
Does **not** send invitations; leftover fills leave existing delivery channel
flags in place. Server boot replaces a stored token that is not a 6-char
`[0-9a-z]` id, or that is a reserved first segment, with the same allocator.
The pair and reveal count stay; a link already sent with the old token stops
opening.

`setAutomaticExclusions` writes the edition immediately and, when a draw
exists, the same two columns on that draw. `addManualPair` does the leftover
+ exclusion + self-draw + past-pairing (when `avoidPastPairings` is active)
checks against the edition, creates a draw row if none (copying those flags),
and does **not** auto-deliver. Deleting the last assignment also deletes the
draw row.

`currentDrawResultsCsv` archives that same current draw. Rows are the
guest display names, sorted by giver then receiver. A giver or receiver
who is not seated on the edition is omitted rather than given a stand-in
name. The file name uses the edition’s party year.

History SQL: past assignment → past guests’ people → current edition guests
with the same people. Only `pastEvent.occursOn < current.occursOn`.

## People and names

| File | Role |
|---|---|
| `lib/people.ts` | Find-or-create, `insertOrganiserPerson`, seats, update, photo, delete |
| `lib/people-types.ts` | `GuestDeleteScope`, `PersonWithEvents` |
| `lib/guest-contact.ts` | Normalize email/phone; `joinNames` (English lists); shared-contact warnings |
| `lib/guest-draft.ts` | Dirty-tracking for guest forms. Agreed gender and Polish cases from namesakes, and the same-name question |
| `lib/person-name.ts` | `normalizeName`, `initials` (first two words), Polish `compareNames` |
| `lib/name-cases.ts` | Seven Polish cases + `{giver_dopelniacz}` etc. Person saves require all six |
| `lib/gender.ts` | `female` \| `male`. Required on a person save and when seating a guest (`Gender is required.`). Unset stays empty in `{giver_gender}` and blocks invitation send and wishlist-change notices. The guest and people lists show that error on the collapsed row |
| `lib/language.ts` | `pl\|en\|de\|es\|ja`. Default **Polish** |
| `lib/phone.ts` | Stored digits only, no `+`. Default dial `351` |

`findOrCreatePerson` matches `nameNormalized` **and** compatible contact
(incoming phone/email must not contradict stored). A blank phone and email
are not contact: if anyone with that name already exists, it throws
`PersonError` (`A person named … already exists…`, or the several-people
message) instead of merging. `createNew` inserts another person with the
same name. A phone or email that matches one person still reuses them and
fills empty fields; it does not overwrite filled cases. A person save is
refused unless gender is `female` or `male` (`Gender is required.`) and all
six Polish cases are present (`Enter the missing Polish cases: …`). Seating
a guest (`addGuestToEvent`) also requires a gender. Signup and
`afterCreateUser` both call `insertOrganiserPerson`, which stores the name,
normalized name, phone, email, and user id, and leaves gender and Polish
cases empty. The next edit or guest save is what demands them.
`guestEmailById`: person email, else linked user’s login email.

## Events

| File | Role |
|---|---|
| `lib/events.ts` | Series/edition CRUD, copy guests+exclusions, visibility |
| `lib/event-problems.ts` | `editionProblemCount` for the event list |
| `lib/event-name.ts` | `{event}` overlay per language. Polish, German, Spanish, Japanese, and the six Polish cases are required on edition update; cases inflect the **Polish** nominative |
| `lib/event-date.ts` | `{date}` and parts from `occursOn`. Month name follows the template language; only Polish inflects the month. `missingEventDateMessage` names a blank party date on save. `missingEventDateSendReason` blocks invitation send when the date is blank or not a real calendar date |
| `lib/event-location.ts` | `{location}` (place name, every language) and `{location_gdzie}` (Polish phrase with its preposition). A blank field leaves its token in the copy. `missingEventLocationMessage` names the blank fields and blocks an edition update; `missingEventLocationSendReason` blocks invitation send |
| `lib/event-code.ts` | Re-exports ids, occurs-on helpers, `eventLabel`, `compareEventsByRecency`, and `allocateUniqueRevealToken` (skips ids already in use) |
| `lib/ids.ts` | Codes, 6-char reveal tokens (minting skips reserved segments), `slugify` |
| `lib/occurs-on.ts` | Valid calendar `YYYY-MM-DD` |
| `lib/schemas.ts` | Shared Zod (`eventPatchSchema`, `personFieldsSchema`, …) |

`visibleEventsFor` / `visibleSeriesFor` return everything for admin, nothing
otherwise — no per-user ACL. `visibleSeriesFor` adds `problemCount` on each
edition. One problem is one template cell that fails placeholder validation,
one seated guest missing a gender or any Polish case (both on the same guest
count once), or one Event settings input that is blank or invalid: the
English name, the date, the place, the Polish place phrase, each translated
name, and each Polish case. No budget choice is one problem and does not
include amounts. Make the gift and no spending limit add none. Set a budget
counts the amount and each of EUR, PLN, and JPY when that number is missing,
zero, or not positive. The selected currency is one more problem when its
positive amount differs from the amount. On that choice, a currency code
other than EUR, PLN, or JPY is also one problem.

`deleteEdition` refuses completed draws; last
edition also deletes the series. Creating an edition may leave the Polish,
German, Spanish, and Japanese names blank, and the six Polish cases null.
`updateEdition` refuses any write that would leave one of those four names
blank, and the error names the missing languages. It also refuses a write
that would leave a Polish case blank (`Enter the missing Polish cases for the
event name: …`), and a blank party date, leaving the stored values in place.
A patch that omits `occursOn` or a case keeps the stored value. English stays
the canonical `name`. `createEdition` copies the budget with `effectiveBudgetKind`: a stored kind
wins, and a positive amount with no kind is stored as `amount`. The amount
and currency extras are copied as stored. It copies `location` and
`locationGdzie` from the source edition, or leaves them null. It also copies
`event_template`
rows from the source, or snapshots the Settings JSON when the source has
none. Automatic exclusions are not copied; `avoidPastPairings` starts on
only when an earlier edition already exists. `updateEdition` refuses any
write that would leave either one blank (`Enter the missing location: …`),
and keeps the stored values.

## Delivery

Invitations are sent only from the Delivery tab (`POST /send`). Draw
execution mints tokens and does not call `deliverAssignments`.

| File | Role |
|---|---|
| `lib/delivery/channels.ts` | ChannelAdapter: WhatsApp / Signal / email |
| `lib/delivery/index.ts` | `deliverAssignments` — send, then persist flags + `invitation_send` |
| `lib/invitation-send.ts` | Delivery-tab orchestration (`pending` \| `resend`). `invalidTemplatesReason` blocks both sends |
| `lib/invitation-channels.ts` | Disable reasons, `invitationActionState`, channel selection. Invalid templates after location and before budget |
| `lib/invitation-send-types.ts` | View DTOs |
| `lib/delivery-status.ts` | `RevealLink` view model for admin UI. `blockedReason` hides the copy control |
| `lib/phone-send.ts` | Shared `{ to, ok, error? }` shape |

| Channel | Address | Skip without address | Template |
|---|---|---|---|
| WhatsApp | `guest.phone` | counts as failed | Meta template, **not** app templates |
| Signal | `guest.phone` | counts as failed | `signal.body` |
| Email | person email or linked login | **does not** count as failed | `renderEmail` |

Unconfigured channels cannot be enabled (`unconfiguredDeliveryError`).
Sends in parallel across channels; Signal itself is sequential (one store).
Email failures stored as `emailFailed` + clipped reason (300 chars).

Invitation rules: no send when the party date is blank or not a real calendar date (`Cannot send invitations because the event has no valid party date. Set the date before sending, because guest messages include it.`); that failure is not reported as a past event; no send when a valid `occursOn` is before today (UTC); need a completed draw;
no send while any seated guest has no gender (the error names those
guests); no send while any seated guest is missing a Polish case (the error
names those guests); no send while the edition is missing a Polish, German,
Spanish, or Japanese name (the error names those languages); no send while
the edition has no place name or no Polish "gdzie?" phrase (`Cannot send
invitations because the event is missing its location: …`); no send of
email or Signal while a guest who would receive that channel has no
template pack for their language, or a required field in that pack is
blank. The email error names those guests, or the language and the missing
fields. WhatsApp uses the Meta template and is not part of the template check, so
a WhatsApp-only selection still sends when templates are missing. A missing
party date blocks every channel, including WhatsApp. No send while the
resolved budget choice is unset (`Choose a budget, make-the-gift, or no spending limit.`).
The draw's choice wins when it has one; otherwise the edition's choice is
used, and the first successful send copies that choice onto the draw.
A blank amount, make-the-gift, or no-limit sentence for a seated guest's
language also blocks send. WhatsApp still carries only the name and link.
The draw-list copy
control stays inactive, and does not show the URL, while a seated guest is
missing a gender or Polish case, the edition is missing a translation or its
location, or a configured email or Signal template is incomplete
(`revealLinkBlockedReason`).
A past date, no configured channel, and a guest with no phone or email
leave the copy control available. The draw does
not check the party date, location, budget choice, gender, cases, translations, or templates. **pending** = never delivered
on any channel; **resend** requires a prior send. Selecting a subset of
channels can demote recipients to unreachable.

## WhatsApp / Signal / Email / Push

| File | Role |
|---|---|
| `lib/whatsapp.ts` | Graph API v19.0. `{{1}}` name, `{{2}}` URL |
| `lib/signal.ts` | Sequential send. Recipients: E.164, ACI UUID, or `self` |
| `lib/signal-store.ts` | `SIGNAL_STORE_DIR`. Configured iff `.linked` exists |
| `lib/signal-link.ts` | In-process QR linking. The Settings page shows the QR and checks every 2 seconds. `npm run signal:link` is the same flow from the terminal |
| `lib/go-signal.ts` | Download/verify go-signal 0.3.0 into `data/bin/` on first link (Linux or macOS), process mutex, exit 3 = unlinked |
| `lib/email.ts` | Nodemailer. Mailbox from Settings, not env. Draw mail: `X-Santa-Token` + Message-ID `<santa.{token}@{domain}>`. Transporter cached per mailbox. Test mail: empty batch is `ok: false` with an indeterminate error. Test hook: `resetMailClient` |
| `lib/email-bounce.ts` | IMAP INBOX poll. Runs only when an IMAP host is stored. DSN parse. UID cursor in `app_setting`. Marks the matching assignment; the Draw tab guest links show the failure. Never throws |
| `lib/push.ts` | web-push + VAPID. Sends only when keys and a subject are stored. `pushToAdmins`. Dead endpoints 404/410 deleted |

Signal has no Cloud API; this app is a **linked secondary device**. The
first **Link device** downloads the binary into `data/bin/`. On the phone:
**Signal → Settings → Linked devices → Link new device**, then scan the QR.
Linking writes a `.linked` marker under `SIGNAL_STORE_DIR` (default
`data/signal`). Idle ~30 days → unlinked. Background job pings twice a day.

Guest activity push kinds: opened / revealed / wishlist_added /
wishlist_read — **never include wishlist item text**. Wishlist-change
notices to the giver use Signal and email only (`lib/wishlist-notify.ts`):
one claim per unseen stretch, both channels when they can reach that
santa, no invitation flags or `invitation_send` rows. WhatsApp is unchanged.

## Templates

Barrel: `lib/templates/index.ts`.

| File | Role |
|---|---|
| `fields.ts` | Languages, field ids, placeholders; bundled JSON import of `defaults/{lang}.json` |
| `defaults/{lang}.json` | Committed reference copy (en, pl, de, es, ja). Settings → Templates reads and writes these files. Wording keeps a warm, friendly tone that is easy to understand, and follows official grammar, spelling, and letter punctuation for each language wherever possible (vocative commas in English, Polish, and Spanish greetings, and German `Hallo {giver}!` without a comma; English targets the British variant — British spelling and grammar, spaced en-dashes, `PS` without periods; Polish and German lowercase after a comma salutation; Spanish colon after the greeting and `P. D.:` with a colon; Polish `PS` without periods). Guests are addressed by first name, so informal greetings like Polish `Cześć` are intentional. `{location}` is typically a city or town name, so `in {location}` / `en {location}` / `{location}に` in non-Polish templates is intentional (`{location_gdzie}` still carries the Polish preposition). Tentative phrasing about gathering in `{location}` (including Japanese `過ごせそうだよ`) and the note about sending presents by post are intentional. Polish `dla jednej wylosowanej osoby` (`jednej`) intentionally stresses preparing a single present. Delivered emails are assumed to render HTML buttons properly. Casual, friendly Japanese is intentional, and the instructions stay simple. Local rationale for these choices, when present, is gitignored `PRIVATE_CONTEXT.md`; do not commit it |
| `parse.ts` | `{name}`, `{giver_gender\|female:…\|male:…}` (no fallback), `{guest_count\|1:…\|2:…\|fallback}` |
| `count.ts` | Polish Gettext-style vs other langs (`1` vs fallback) |
| `validate.ts` | Unknown / unclosed / invalid / duplicate branches. Plain-language problem lines, counted heading, save reason, and `invalidTemplatesReason` for invitation send. `templateErrorCounts` totals those problem lines per language. `templateErrorTotal` is that total for a stored view, shown on the Templates tab even when the editor is closed. The heading still counts invalid fields |
| `autocomplete.ts` | Edit-distance ranking |
| `render.ts` | `renderTemplate`, `revealCopy` |
| `email.ts` | HTML card mail. Winter banner inlined as CID, not fetched from the site. `bannerSrc` swaps that for a public URL in the template preview. `renderEmail` takes subject/body/button field ids and defaults to the invitation. `WISHLIST_EMAIL_FIELDS` and `WISHLIST_SIGNAL_BODY` are the wishlist-notice ids shared by the sender and the preview |
| `vars.ts` | `budgetCopy`, `invitationVars`, and `wishlistNoticeVars` (giver, event, url — never the receiver) |
| `preview-fixtures.ts` | Sample guests and editions for the preview. Not written to the database |
| `preview.ts` | Random sample, which surface a template opens, and the email / Signal / push / reveal builders |
| `reference.ts` | Disk read/write of the JSON files (`fs`, not a bundled import). Atomic rename. Tests point this at a temp copy so Vitest never writes the committed files |
| `event-rows.ts` | `event_template` snapshot/copy/load. `copyEventTemplatesOn` runs inside `createEdition` |
| `store.ts` | `getTemplates` / `setTemplates` (JSON reference) and `getEventTemplates` / `setEventTemplates` (edition rows). `templatesForGuestPage` uses the edition when the token is valid and the JSON reference when it is not. `materializeMissingEventTemplates` fills editions that still have no rows |

Keys omitted from `vars` are left as `{token}` so `{receiver}` can stay in
pre-unwrap copy. `resolveTemplateLanguage`: unknown guest lang → **English**
for the reveal page, OG image, and organiser push. Invitation email and
Signal refuse the send instead of using that fallback.

Settings → Templates is the JSON reference for every edition. Saving it
writes `lib/templates/defaults/{lang}.json` on the running machine. A
production save lasts until the next `rsync --delete` from the laptop;
commit the JSON from the checkout you edited. There is no Restore button
on that page. Each edition has its own `event_template` rows. Creating an
edition copies the previous edition in the series, or snapshots the JSON
when there is no previous copy. Restore on the edition tab copies the
**current** JSON into the form for the language you are looking at and
still waits for Save. A blank field is stored as `""`. Invitations, the
guest page, reveal-link blocks, and organiser push use that edition's
rows. An invalid guest link has no edition, so it uses the JSON
reference.

Wishlist-change fields (`email.wishlist_*`, `signal.wishlist_*`) go to the
giver once, until they view the list. They may use giver name/gender,
`{url}`, `{button}` on email bodies, and `{event}` on subjects. Receiver
tokens are rejected on those fields. Invitation send does not require
them. Existing editions fill missing ids from the Settings JSON until
that edition’s templates are saved. The shared button previews inside
the “added” mail.

`{date}` is the long form for the template language (`2 sierpnia 2027`,
`2 August 2027`, `2. August 2027`, `2 de agosto de 2027`, `2027年8月2日`).
Parts are `{date_day}`, `{date_day_pad}`, `{date_month}`, `{date_month_pad}`,
`{date_year}`, and `{date_month_name}`. Polish also has
`{date_month_dopelniacz}`, `{date_month_miejscownik}`, and
`{date_month_narzednik}` (`24 grudnia`, `w listopadzie`); other languages
repeat the month name. A missing or invalid party date leaves `{date}` in
rendered copy on the guest page and in organiser push. Invitation send
refuses that date before any channel is used, so those messages are not
sent. Default invitation mail and Signal take `{date}` and `{date_year}`.
Reveal and push defaults do not include `{date}`. Invitation subject, body,
and Signal also take `{location}` (`Katowice`) and `{location_gdzie}`
(`w Katowicach`); the Polish default body uses `{location_gdzie}`. The plain-text mail drops spaces at the
start of each line, so a `{budget_line}` paragraph loses its leading space
there as it does in HTML. `{budget}` is the formatted amount. `{budget_line}`
is the sentence for the active choice: the amount line, the make-the-gift
line, or the no-limit line. Signal's default body includes `{budget_line}`.
The guest page chip uses the matching reveal sentence and stays hidden
while the choice is unset. WhatsApp stays on the Meta template. Reveal
unwrap copy and the own-wishlist description can take `{giver}`; the
revealed title, revealed name, match-wishlist heading, and empty line take
`{receiver}`. The large name is `reveal.revealed_name` (`{receiver}` in
most languages, `{receiver_biernik}` in Polish). After unwrap, returning
guests may see a previous-years card (`reveal.previous_title`,
`reveal.previous_description`, `reveal.previous_row`). The row is filled
per past gift with `{year}` (that edition’s calendar year) and `{receiver}`
cases; Polish defaults use `{receiver_dopelniacz}`. `{year}` is only
meaningful in that row. The card is omitted when there is no earlier
completed gift in the same series.
Add / Edit / Save / Cancel / Remove / placeholder labels on the guest's
own list are built-in per language, not templates. An empty own list has
no extra hint.

Settings → Templates and the edition Templates tab can preview the unsaved
copy. The sample is a fixture
guest pair on a fixture edition (`lib/templates/preview-fixtures.ts`): mixed
languages, contact, portraits, places with each Polish preposition (`na`, `w`,
`u`), and all three budget choices. Refresh picks
another pair. The preview does not open a live `/{token}` and does not ping
open or unwrap. The reveal-page button unwraps the fixture locally: it shows
the unwrapping label, then the match. The giver's own list is on the page
in every reveal stage except an invalid link. After unwrap, a previous-years
list appears when the fixture giver has `previousGifts` on that edition
(family, office, and summer; first-year fixtures stay empty). Portraits are
illustrated files in `public/preview/guests/`.
Mail uses `bannerSrc` so the winter banner loads as a normal image.

## Reveal / wishlist

| File | Role |
|---|---|
| `lib/reveal.ts` | `isRevealed` ⇔ `revealCount > 0`. `RevealedMatch` and `PastGift` types |
| `lib/reveal-history.ts` | Past gifts for the reveal page: same series, earlier `occursOn`, newest draw per edition, current person names. Does not require the receiver to be seated this year (unlike solver history) |
| `lib/guest-link.ts` | Token → assignment + giver + receiver. Open/unwrap/seen. Unwrap and wishlist-seen stamp `wishlistSeenAt` and clear `wishlistNotifyClaim` |
| `lib/wishlist.ts` | CRUD (add / edit / delete); bumps `wishlistUpdatedAt`; organiser push on add without text; giver notice via `wishlist-notify` |
| `lib/wishlist-notify.ts` | Atomic `wishlistNotifyClaim`; Signal + email to the giver; skip if giver or receiver has no gender; release the matching token when nothing delivered |
| `lib/request-meta.ts` | IP from `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` |
| `lib/user-agent.ts` | Best-effort browser/OS for `guest_activity` |

`loadRevealedMatch` must not leak phone/email. First unwrap backfills
`openedAt`. `markMatchWishlistSeen` no-ops until unwrapped. Opening the
wrapped page does not clear a wishlist notice. Unwrap does, because it
already stamps the list as seen.
`listPastGiftsForGiver` is empty for a first edition, a first-time giver,
another series, or a later `occursOn`. Newest year first. Invalid
`occursOn` rows are skipped. OG copy still includes no names.

## Photos, FX, budget

| File | Role |
|---|---|
| `lib/photo.ts` | `UPLOADS_DIR` or `{sqliteDir}/uploads`. Filename 48 hex + ext. Max 2 MB |
| `lib/photo-process.ts` | Scale longest edge ≤ 1200 (`scaleToMaxEdge`, `downscalePyramid` for the halving steps). `coverMinZoom` is the farthest zoom-out that still covers the circle. `clampCropRect` keeps a crop inside the source image |
| `lib/budget.ts` | `amount` / `zero` / `unlimited`. EUR/PLN/JPY extras, humanize, guest-facing snapshot. `formatBudget` prints the amount in the template language (Polish `100 zł` / `1 000 ¥`, English `€100` / `PLN 100` / `¥1,200`, Japanese `€100 (約3,000円)` / `100 PLN (約4,000円)` / `1,200円`, German `1.000,00 PLN`, Spanish space thousands) |
| `lib/fx.ts` | NBP Table A, 24h TTL, 3s timeout, PLN pivot, plausibility bands |

`completeBudgetSnapshot`: old draws with null extras inherit from the event
if the primary amount/currency still match. Fail → 503 `DomainError`.
Test hooks: `setFxFetch`, `setFxNow`, `resetFxInflight`.

## Auth / session / signup

| File | Role |
|---|---|
| `lib/auth.ts` | Better Auth config. Email verification on when env SMTP is complete (boot-time switch; sending uses Settings mailbox). Password reset sends through that mailbox and revokes sessions |
| `lib/auth-secret.ts` | Status of `BETTER_AUTH_SECRET` / `AUTH_SECRET`; rotate writes `.env`, patches the live Better Auth snapshot, deletes `session` rows. Never returns the secret. Tests set `AUTH_ENV_PATH` |
| `lib/auth-secret-types.ts` | `AuthSecretStatus` (safe for client import) |
| `lib/auth-hooks.ts` | `user.create` before/after (`ADMIN_EMAIL` lock, first-user reject, `insertOrganiserPerson`) |
| `lib/auth-role.ts` | `organiserSignupAllowed` |
| `lib/auth-email.ts` | Env SMTP check for verification-required, unverified-login copy, auth client error text (client-safe) |
| `lib/auth-email-send.ts` | Organiser verification and password-reset mail via `sendTransactionalEmail` (Settings mailbox); Better Auth adapters `sendBetterAuthVerificationEmail` and `sendBetterAuthResetPassword` |
| `lib/rate-limit.ts` | In-memory sliding window. Buckets `auth` / `signup` / `guest`. Sign-in and `request-password-reset` share `auth` (5 / 15 min / IP). Test hooks: `setRateLimitNow`, `resetRateLimit` |
| `lib/auth-client.ts` | Browser client. Origin = `window.location.origin`. Exports sign-in and password reset |
| `lib/session.ts` | `getCurrentUser`, `requireAdminPage`, `hasRegisteredUser` |
| `lib/signup.ts` | `signupFirstOrganiser` |
| `lib/signup-pending.ts` | Process singleton for the organiser name, phone, and email until `insertOrganiserPerson` |

## Settings / OG / HTTP

| File | Role |
|---|---|
| `lib/settings.ts` | KV get/set. Blank deletes. `cachedSetting` is process-wide (`globalThis`) so API writes invalidate RSC reads; in-flight reads that finish after a write are dropped. Test hook: `setSettingMapLoad` |
| `lib/integrations.ts` | DB-only WA / SMTP+IMAP / VAPID. Secrets hidden. WhatsApp needs a stored template language, push needs a subject, and bounce polling needs a stored IMAP host. A blank SMTP port connects as 587 and a blank IMAP port as 993 |
| `lib/integrations-types.ts` | View types |
| `lib/og.ts` | Site title/description/icon/banner. Reveal OG = localized generic copy + `og-banner-{lang}.jpg`; never names |
| `lib/api.ts` | `route()`, `parseJson`, `parseRouteId`, `catchDomainErrors` |
| `lib/http.ts` | Status helpers including 429 `tooManyRequests` |
| `lib/errors.ts` | `DomainError` subclasses |
| `lib/public-path.ts` | `basePath`, guest URLs, auth origin |
| `lib/fetch-json.ts` | Client fetch that never throws |
| `lib/request-cache.ts` | `react.cache` wrapper (identity in tests) |
| `lib/process-singleton.ts` | Survive Next hot reload |
| `lib/utils.ts` | `cn`, `qty` |
| `lib/japanese.ts` | Script detector + Google Fonts href |

## Database runtime

`lib/db/sqlite.ts` — default `data/santa.sqlite`. Creates parent dir.
`lib/db/index.ts` — connection reused on `globalThis` in non-production.
Import must not throw during `next build`.

## Scripts and jobs

| File | Role |
|---|---|
| `instrumentation.ts` | Boot hook → `startBackgroundJobs` |
| `lib/background-jobs.ts` | Signal 30s/12h, bounce 8s/60s. Idempotent |
| `scripts/migrate.ts` | Runtime migrator + squash-skip sentinels for 0001–0005 |
| `scripts/signal-link.ts` | CLI alternative to Settings QR link |
| `scripts/render-email-art.tsx` | Rasterise winter SVG → email banner and per-language OG images |
| `scripts/render-icons.ts` | Rasterise `public/icon.svg` → `android.png` (192) and `ios.png` (512) |

## Call graph

```
startDraw / executeDraw
  → leftoverIds + runDraw(+ pastPairingLayers)
  → insert assignment + revealToken

guest opens /{token}
  → guestLinkByToken
  → markGuestLinkOpened / Revealed
  → notifyAdminsOfGuestActivity
  → loadRevealedMatch (no contact)

Delivery tab
  → getInvitationSendView → sendInvitations → deliverAssignments

createEdition
  → copy guests + exclusions (personId remap)
  → copy event_template rows (or snapshot the JSON reference)
  → later avoidPastPairings remaps old assignments the same way
```
