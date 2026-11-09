# Data model

SQLite via Drizzle. Schema: `lib/db/schema.ts`. Runtime: `lib/db/sqlite.ts`
(WAL, `foreign_keys=ON`, `busy_timeout=5000`) and `lib/db/index.ts`.

App tables use autoincrement integer `id`. Better Auth tables use text PKs.
Helpers: `bool` = integer boolean, `ts` = integer timestamp.

```
event_series 1──* event 1──* guest *──1 person *──0..1 user
                    │          │
                    │          ├──* wishlist_item
                    │          └── giver / receiver on assignment
                    ├──* draw 1──* assignment ── revealToken
                    │                ├──* invitation_send
                    │                └──* guest_activity
                    ├──* exclusion (guest a, guest b)
                    ├──* event_template
                    └──* event_photo 1──* event_photo_variant
```

Deleting an edition cascades guests, draws, assignments, exclusions,
wishlists, invitation logs, activity, event templates, and photos
(application code also removes `UPLOADS_DIR/gallery/{id}/`). Deleting a person cascades seats.
`person.userId` is **set null** if the login is deleted. Completed-draw
membership **blocks** person/guest/edition deletion in application code.

## Better Auth

`user`, `session`, `account`, `verification` — generated shape for SQLite
plus admin-plugin fields on `user`: `role`, `banned`, `banReason`, `banExpires`.
`user.email` unique. `session.userId` / `account.userId` cascade.

## App tables

### `event_series`

Recurring identity (Xmas, Office). `name`, unique `slug` (slugified name,
uniqueness via `uniqueSeriesSlug`).

### `event`

One dated edition. Unique `code` (6-char URL id). **Names are not unique.**
`occursOn` is `YYYY-MM-DD`. Language overlays `nameEn/De/Es/Ja/Pl` plus six
Polish cases. `namePl`, `nameDe`, `nameEs`, and `nameJa`, and the six Polish
cases, are required when an edition is updated; create may still insert them
as null. `nameEn` stays optional. Budget choice `budgetKind`: `amount`, `zero`
(make the gift), or `unlimited` (no spending limit). Null means not chosen.
Create may leave it null; an update cannot. `amount` stores `budget` +
`currency` (`EUR`\|`PLN`\|`JPY`) plus denormalized `budgetEur/Pln/Jpy`.
The other two kinds store those amounts as null. A positive `budget` with a
null kind is treated as `amount` (rows from before the choice existed).
`location` is the place name, the same in every language (`Katowice`).
`locationGdzie` is the Polish "gdzie?" phrase with its own preposition
(`w Katowicach`, `we Wrocławiu`, `u babci`). Both are stored trimmed or null
and copied to a new edition in the series. Create may leave them null; an
update cannot, and invitations wait for both.
Automatic exclusions `allowSelfDraw` (default false) and `avoidPastPairings`
(default false) are the live draw rules for the edition. A new later edition
turns `avoidPastPairings` on when an earlier date already exists in the
series; it does not copy either flag from the source. A date change does not
rewrite a saved choice. The draw copies both onto the lottery row when it
runs (`avoidPastPairings` only if an earlier edition still exists).

### `event_template`

Per-edition email / Signal / push / reveal copy. Unique
`(eventId, language, templateId)`. `value` is the literal text, including
blank. Not in git. Creating an edition copies the source edition's rows, or
inserts the current Settings → Templates JSON when the source has no rows.
A later JSON edit does not change an edition that already has rows. Missing
field ids on a partial snapshot are filled from that JSON at read time.

### `event_photo`

One organiser-uploaded photo on an edition. Random 32-hex `id`. Original
name, mime, extension, byte size, width/height after rotation. HEIC may
be 1×1 until the first variant finishes. `capturedAt`
(EXIF `DateTimeOriginal`, then the browser `lastModified`, then upload)
time), `uploadedAt`. Files live in `UPLOADS_DIR/gallery/{id}/` as
`original.{ext}` plus `{variant}.avif`. Not copied to a new edition.
Guests see a row only after the `thumb` variant is `done`. Sorted oldest
`capturedAt` first.

### `event_photo_variant`

One row per photo and size (`thumb`, `hd`, `fhd`, `uhd`). Unique
`(photoId, variant)`. `status` `pending` \| `running` \| `done` \| `error`,
plus `error`, `durationMs`, and `bytes`. The photo worker claims `pending`
rows (every photo's `thumb` before any `hd`, and so on).

### `person`

App-wide identity. `name` + `nameNormalized` (lowercased, collapsed
whitespace — used for find-or-create). Same six Polish cases, all required
on a person save. An edition update requires the same six cases on the event
name (`Enter the missing Polish cases for the event name: …`); create may
still leave them null. `phone` and `email` nullable, **not unique**, indexed.
`language` default `pl`.
`gender` `female`\|`male`, nullable in the database so older rows and the
organiser created at signup can exist without one. A person or guest save
requires `female` or `male` (`Gender is required.`). The guest and people
lists show that error on the collapsed row. Invitations and the reveal-link
copy wait until every seated guest has one. `photo` is a filename, not a blob.
`userId` → `user.id` **set null**, unique index (one login per person;
SQLite allows many NULLs).

### `guest`

Seat in one edition. Unique `(eventId, personId)`. `wishlistUpdatedAt`
clock for “match list changed since santa last looked”.

`GuestView` = guest seat **plus** person fields. `id` is the **guest** id.

### `draw`

Current lottery on an edition. Newest `(eventId, createdAt)` is *the*
draw. Status type is only `"completed"` (rows are inserted already
completed). Copies event name and budget choice at insert. A positive amount
with a null kind is stored as `amount`. Flags: delivery channels, and the
automatic-exclusion copy used for this lottery (`allowSelfDraw`,
`avoidPastPairings`; live choice lives on `event`). Solver stats: `durationMs`,
`attempts`, `historyLayers`, `layersDropped`, `relaxedRestrictions`.

### `assignment`

`giverId` → `receiverId`. Unique per giver **and** per receiver in a draw.
Unique `revealToken` (6-char `[0-9a-z]`, never a reserved first segment). `revealCount`, `openedAt`, `wishlistSeenAt`.
`wishlistNotifyClaim` is a one-shot token: empty allows a giver wishlist
notice; a value means a notice is in flight or waiting until the santa
looks. Delivery bools + `emailFailed` / `emailFailedReason`. Those
invitation flags are not written by a wishlist-change notice.

### `exclusion`

Undirected forbidden pair on an edition. Stored `aId <= bId`. Unique
`(eventId, aId, bId)`.

### `invitation_send`

Append-only send log. `source`: `"draw"` \| `"pending"` \| `"resend"`.
New sends are `"pending"` or `"resend"`; `"draw"` remains on older rows.
`channel`: whatsapp / signal / email. `status`: sent / failed / skipped.
Grouped by `batchId`.

### `guest_activity`

Append-only debug log: `"opened"` \| `"revealed"` + IP / UA / browser / OS.

### `wishlist_item`

Text items on a guest seat. No uniqueness.

### `push_subscription`

Organiser Web Push. Unique `endpoint`. `p256dh`, `auth`.

### `app_setting`

KV store. Blank/null **deletes** the key (`lib/settings.ts`). Keys include
integrations (`wa.*`, `email.*`, `push.*`; DB-only, no env fallback), FX
cache, OG tags, IMAP UID cursor, per-admin email test recipient. Message
templates are **not** stored here: the Settings → Templates reference is
`lib/templates/defaults/{lang}.json`, and each edition has `event_template`
rows.

## Codes and tokens (`lib/ids.ts`)

| Kind | Length | Alphabet | Where |
|---|---|---|---|
| Event code | 6 | `[0-9a-z]` | `/e/[code]/…`, `/api/e/[code]/…`, `/api/events/[code]` |
| Reveal token | 12 | `[0-9a-z]` | `/{token}`, `/api/reveal/[token]/…` |
| Series slug | ≤40 hyphenated | NFKD, no diacritics | uniqueness only, not in guest URLs |

Cryptographically random, rejection-sampled. Unique retries cap at 20.

## People vs guests

| | Person | Guest |
|---|---|---|
| Lifetime | App-wide | One edition |
| Holds | Name, cases, phone, email, language, gender, photo, optional login | Seat + wishlist clock |
| Unique | Soft: `findOrCreatePerson` matches `nameNormalized` + compatible contact. No phone and no email does not merge into a namesake unless `createNew` | Hard: `(eventId, personId)` |
| Contact sharing | Allowed | Inherited |
| Wishlist | — | Edition-specific; not copied |
| History / edition copy | Join key | New seats remapped by `personId` |

`findOrCreatePerson`: incoming phone/email must not contradict stored.
No phone and no email, when a namesake exists, is a `PersonError` unless
`createNew`. Ambiguous namesakes that a supplied contact still does not
separate → `PersonError`.

New edition (`createEdition`): copies guests and remaps exclusions by
person. Wishlists, draws, and photos are **not** copied. Budget, translated names,
location, and templates copy from the source edition (or latest other
edition in the series). Automatic exclusions are **not** copied:
`allowSelfDraw` starts false, `avoidPastPairings` is on only when an earlier
date already exists in the series. A first edition snapshots the JSON
reference.

Delete guest `?scope=event` (default) removes the seat; `?scope=person`
wipes the person (every seat, contact, photo). Blocked if that guest is
in a completed draw.
