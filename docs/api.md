# API catalog

34 `route.ts` files under `app/api/`. Almost every handler is wrapped by
`route()` in `lib/api.ts`. JSON errors are always `{ "error": "<message>" }`.
There is no collection GET for people (the settings page loads via RSC).

Client URL helpers: `apiPath`, `eventApiPath(code, path)`, `revealApiPath(token)`,
`photoUrl` in `lib/public-path.ts` (they prepend `NEXT_PUBLIC_BASE_PATH`).
The browser never throws on failed fetches: `lib/fetch-json.ts` returns
`{ ok, data, error, status }`.

Auth modes and helpers: [architecture.md](architecture.md) and `lib/api.ts`.
`opts.body` is a Zod schema. `opts.id: true` parses `params.id` via
`parseRouteId`. `catchDomainErrors` maps `DomainError` to `{ error, status }`.

HTTP helpers (`lib/http.ts`): 400 `badRequest`, 403 `forbidden`, 404
`notFound`, 409 `conflict`, 429 `tooManyRequests`, 500 `serverError`, 503
`unavailable`. **409** means “not configured / wrong state” for
integrations. **429** is `{ error: "Too many requests. Try again later." }`
plus `Retry-After`. Sign-in and password-reset requests share 5 / 15 min / IP;
signup is 5 / hour / IP; reveal POSTs are 120 / 5 min / IP
(`lib/rate-limit.ts`). Setting a new password is not limited.

## Auth and signup

### `GET|POST /api/auth/[...all]`

**File:** `app/api/auth/[...all]/route.ts`  
**Auth:** Better Auth (cookie session). **Does not use `route()`.**  
Delegates to `toNextJsHandler(auth)`. Rewrites `request.url` with
`withAuthPath` so Better Auth still matches `/your-prefix/api/auth`
after Next strips `basePath`. **POST** `/sign-in` and **POST**
`/request-password-reset` share one rate limit (5 / 15 min / IP). **POST**
`/reset-password` is not limited. Other auth paths are not. Password reset
mail uses the Settings mailbox. The email link is Better Auth's
`/reset-password/:token` redirect, which lands on `/login/reset?token=`.
An invalid or expired token redirects to `/login/reset?error=INVALID_TOKEN`.
Unknown addresses get the same success response as known ones.

### `POST /api/signup`

**Auth:** `public` (rate limit `signup`, 5 / hour / IP)  
**Body:** `{ name, email, password (min 8), phone? }`  
**200:** `{ ok: true, needsVerification }` — `needsVerification` is true when
env SMTP is complete  
**400:** organiser already exists; signup not available (`ADMIN_EMAIL` mismatch
or production without `ADMIN_EMAIL`); invalid phone; Better Auth failure  
**Calls:** `signupFirstOrganiser` (`lib/signup.ts`)

## Events

### `GET /api/events`

**Auth:** `user` (non-admins still get `[]`)  
**200:** `SeriesWithEditions[]` — `{ series, editions }` newest `occursOn` first. Each edition is the event row plus `problemCount` (invalid template cells, guests with a missing or invalid field, and Event settings inputs that are blank or invalid).  
**Calls:** `visibleSeriesFor`

### `POST /api/events`

**Auth:** `admin`  
**Body (discriminated `kind`):**
- `{ kind: "series", name, occursOn }` → `createSeriesWithFirstEdition` → **201** `{ series, event }` (snapshots Settings → Templates onto the first edition)
- `{ kind: "edition", seriesId, occursOn, name, fromCode? }` → `createEdition` → **201** `Event`  
  `fromCode` must be an edition in that series or **404** `"Unknown source edition."` Copies that edition's templates, or snapshots the JSON reference if it has no rows.

### `GET /api/events/[code]`

**Auth:** `eventAdmin`  
**200:** `{ event, series: { id, name }, impact: { guests, wishlists, exclusions, draftDraws, completedDraws, otherEditions } }`  
`draftDraws` is vestigial: `DrawStatus` is only `"completed"`, so this is always `0`.  
**Calls:** `eventImpact`

### `PATCH /api/events/[code]`

**Auth:** `eventAdmin`  
**Body:** `eventPatchSchema` (`budgetKind` `amount` \| `zero` \| `unlimited`; an `amount` needs a positive budget, currency, and matching EUR/PLN/JPY extras; `zero` and `unlimited` clear the amounts; Polish, German, Spanish, and Japanese names, and all six Polish cases, must all be set on the row after the patch; a sent `occursOn` must be a real date; optional string `location` and `locationGdzie` are trimmed, and both must be set on the row after the patch)  
**200:** updated `Event`  
**400:** invalid body; a write that would leave the budget choice unset (`"Choose a budget, make-the-gift, or no spending limit."`); a zero amount (`"Zero is not a budget amount. Choose make-the-gift if guests should not spend money."`); a write that would leave a required translation blank (`"Enter the missing event name translations: …"`); a write that would leave a Polish case blank (`"Enter the missing Polish cases for the event name: …"`); a write that would leave the place name or the Polish "gdzie?" phrase blank (`"Enter the missing location: …"`); a blank date (`"Enter the event date. Guest messages will include it, so these details cannot be saved without one."`)  
**Calls:** `updateEdition`

### `DELETE /api/events/[code]`

**Auth:** `eventAdmin`  
**200:** `{ ok: true }`  
**400:** `"Cannot delete an edition that has completed draws."`  
Last edition in the series also deletes the series.  
**Calls:** `deleteEdition`

## Guests (per edition)

### `GET /api/e/[code]/guests`

**Auth:** `eventAdmin`  
**200:** `GuestView[]` (name-sorted, Polish locale)  
**Calls:** `guestsForEvent`

### `POST /api/e/[code]/guests`

**Auth:** `eventAdmin`  
**Body:** `personFieldsSchema` + optional `personId` + optional `createNew`. Need `personId` **or** `name`, gender (`female` or `male`), and all six Polish cases. `createNew: true` inserts a new person even when that name already exists and no contact was sent.  
**201:** `GuestView`  
**400:** already a guest / name required / `"Gender is required."` / `"Enter the missing Polish cases: …"` / `"A person named … already exists. Choose them from the list, or add a phone or email."` / `"Several people share that name. Add a phone or email to pick the right one."`  
**404:** `"Unknown person."`  
**Calls:** `findOrCreatePerson` (`createNew` skips the namesake merge), or `getPersonById` then `updatePerson` (cases, and language or gender when they changed) then `addGuestToEvent`

### `PUT /api/e/[code]/guests/[id]`

**Auth:** `eventAdmin`, `id: true`  
**Body:** `personFieldsSchema` + optional `userId`. Gender and all six Polish cases are required.  
**200:** `GuestView`  
**400:** `"Gender is required."` / `"Enter the missing Polish cases: …"`  
**404:** `"Guest not found."`  
Linking a login: `assertLinkableUser`

### `DELETE /api/e/[code]/guests/[id]?scope=event|person`

**Auth:** `eventAdmin`, `id: true`  
Query `scope` default `"event"`. Invalid → **400** `"Invalid scope."`  
**200:** `{ ok: true }`  
**400:** completed-draw protection  
**Calls:** `removeGuest`

### `POST /api/e/[code]/guests/[id]/photo`

**Auth:** `eventAdmin`, `id: true`  
**Body:** multipart field `file` (JPEG/PNG/WebP, ≤ 2 MB) — not JSON  
**200:** `GuestView` with new `photo` filename (stored on the **person**)  
**Calls:** `photoFileFromForm` + `savePhoto` + `setPersonPhoto`

### `DELETE /api/e/[code]/guests/[id]/photo`

**Auth:** `eventAdmin`, `id: true`  
**200:** `GuestView` with `photo: null`

## Exclusions

### `GET /api/e/[code]/exclusions`

**Auth:** `eventAdmin`  
**200:** `Exclusion[]`  
**Calls:** `listExclusions`

### `POST /api/e/[code]/exclusions`

**Auth:** `eventAdmin`  
**Body:** `{ aId, bId }` guest ids  
**201:** `Exclusion` with `aId <= bId`  
**400:** guests not in edition / pair already excluded  
**Calls:** `addExclusion`

### `DELETE /api/e/[code]/exclusions/[id]`

**Auth:** `eventAdmin`, `id: true`  
**200:** `{ ok: true }` (idempotent if already gone)  
**Calls:** `removeExclusion`

## Templates (per edition)

### `GET|PUT /api/e/[code]/templates`

**Auth:** `eventAdmin`  
**GET 200:** `TemplatesView` for this edition  
**PUT body:** `templatesPatchSchema`  
**400:** placeholder validation (`Invalid template settings.` / `Invalid placeholder in {language} · {field}: {reason}.`)  
**Calls:** `getEventTemplates` / `setEventTemplates` (`lib/templates/store.ts`)

Blank fields are stored as empty strings on `event_template`. Restore-to-defaults in the UI copies Settings → Templates into the form and still waits for Save.

## Draw and assignments

### `GET /api/e/[code]/draw`

**Auth:** `eventAdmin`  
**200:** `[Draw]` or `[]` (newest draw only, wrapped in an array)  
**Calls:** `latestDrawForEvent`

### `GET /api/e/[code]/draw/results`

**Auth:** `eventAdmin`  
**200:** `text/csv; charset=utf-8` attachment, `Cache-Control: no-store`.  
File name `draw_results_YYYY.csv` from the edition’s party year, or
`draw_results.csv` when that date is blank or not a real day. Header
`giver,receiver`, then one row per pair on the current draw (newest draw
only). Names are the guests’ display names. A pair whose giver or receiver
is not seated on this edition is left out. UTF-8 BOM and CRLF.  
**404:** `{ "error": "No draw yet." }` when the edition has no draw  
**Calls:** `currentDrawResultsCsv`

### `PATCH /api/e/[code]/draw`

**Auth:** `eventAdmin`  
**Body:** optional booleans `deliverWhatsapp`, `deliverSignal`, `deliverEmail`, `allowSelfDraw`, `avoidPastPairings`  
**200:** `{ draw }` — `draw` is null when there is no lottery yet  
`allowSelfDraw` / `avoidPastPairings` always update the edition, and the
current draw when one exists. Delivery flags still need a draw.  
**400:** unconfigured channel, or delivery flags with no draw yet  
**Calls:** `setAutomaticExclusions`, `setDrawDeliveryFlags`

### `POST /api/e/[code]/draw`

**Auth:** `eventAdmin`  
**201:** `{ draw, assignments }`  
Reads automatic exclusions from the edition (`avoidPastPairings` only if an
earlier edition exists) and copies them onto the draw. Reuses the current
draw if one exists; leftover givers/receivers only. Existing pairs and
tokens are kept. **Does not** auto-deliver; channel flags on the draw are
left unchanged.  
**400:** &lt;2 participants, everyone assigned, infeasible exclusions, `"Draw changed, retry."`  
**Calls:** `startDraw`

### `POST /api/e/[code]/assignments`

**Auth:** `eventAdmin`  
**Body:** `{ giverId, receiverId }`  
**201:** `{ assignment, revealLink, draw }`  
Creates a draw row if none exists, copying automatic exclusions from the
edition. **Does not** auto-deliver.  
**Calls:** `addManualPair`

### `PATCH /api/e/[code]/assignments/[token]`

**Auth:** `eventAdmin` (`token` is the reveal token)  
**Body:** `{ whatsapp, signal, email, manual }` all required booleans  
**200:** `{ delivered, emailFailed, emailFailedReason }`  
**Calls:** `setAssignmentDelivery`

### `DELETE /api/e/[code]/assignments/[token]`

**Auth:** `eventAdmin`  
**200:** `{ ok: true, drawDeleted }` — last assignment also deletes the draw  
**Calls:** `deleteAssignmentInEvent`

### `POST /api/e/[code]/send`

**Auth:** `eventAdmin`  
**Body:** `{ mode: "pending"|"resend", channels?: { whatsapp, signal, email } }`  
**200:** `{ delivery }`  
**400:** no draw, nothing to send, action disabled (missing or invalid party date — `Cannot send invitations because the event has no valid party date. Set the date before sending, because guest messages include it.` — past event, missing budget choice — `Choose a budget, make-the-gift, or no spending limit.` — a blank budget sentence for a guest language, missing gender naming the guests, missing Polish cases naming the guests, templates that do not parse — `Cannot send invitations because 1 template is not valid: …`, etc.)  
**Calls:** `sendInvitations`

## People (global)

No `GET /api/people`. RSC: `listPeopleWithEvents` on settings/people.

### `PUT /api/people/[id]`

**Auth:** `admin`, `id: true`  
**Body:** `personFieldsSchema` (gender and all six Polish cases required)  
**200:** `Person`  
**400:** `"Gender is required."` / `"Enter the missing Polish cases: …"`  
**Calls:** `updatePerson`

### `DELETE /api/people/[id]`

**Auth:** `admin`, `id: true`  
**200:** `{ ok: true }`  
**400:** completed-draw protection  
**Calls:** `removePerson`

### `POST|DELETE /api/people/[id]/photo`

**Auth:** `admin`, `id: true`  
Same FormData rules as guest photo. **200:** updated `Person`.

## Guest portal

Wishlist uses `auth: "guest"`. Open / unwrap / wishlist-seen use
`auth: "public"` plus a token lookup. Reveal **POST**s are rate-limited
(`guest`, 120 / 5 min / IP). The guest HTML page is not.

### `POST /api/reveal/[token]`

**Auth:** `public`, rate limit `guest`  
**200:** `{ match: RevealedMatch }` — name cases + photo + wishlist, **no contact**  
**404:** `"This link is invalid."`  
First unwrap sets `revealCount = 1` and `openedAt`; later calls are no-ops.  
**Calls:** `markGuestLinkRevealed`, `loadRevealedMatch`

### `POST /api/reveal/[token]/open`

**Auth:** `public`, rate limit `guest`  
**200:** `{ ok: true }` — sets `openedAt` once  
**Calls:** `markGuestLinkOpened`

### `POST /api/reveal/[token]/wishlist-seen`

**Auth:** `public`, rate limit `guest`  
**200:** `{ ok: true }`  
No-op until unwrapped. Notifies admins if the match’s wishlist changed.
Stamps `wishlistSeenAt` and clears `wishlistNotifyClaim` when the list is
caught up (including the first unwrap).  
**Calls:** `markMatchWishlistSeen`

### `GET /api/reveal/[token]/wishlist`

**Auth:** `guest`  
**200:** giver’s own `WishlistItem[]`

### `POST /api/reveal/[token]/wishlist`

**Auth:** `guest`, rate limit `guest`  
**Body:** `{ text }` min 1  
**201:** inserted item. Push-notifies admins **without** the item text. Claims a
giver notice (Signal and email) when the current draw has another santa.

### `PATCH /api/reveal/[token]/wishlist/[id]`

**Auth:** `guest`, `id: true`, rate limit `guest`  
**Body:** `{ text }` min 1  
**200:** the updated `WishlistItem`. Same text is a no-op (no clock bump, no
notice). A real edit bumps `wishlistUpdatedAt` and uses the “changed”
giver notice. Does not ping organisers.  
**400:** `"Invalid wishlist item."`  
**404:** `"This wish was not found."` when missing or not owned by the giver.

### `DELETE /api/reveal/[token]/wishlist/[id]`

**Auth:** `guest`, `id: true`  
**200:** `{ ok: true }` even if missing or not owned (silent no-op). A real
delete bumps the clock and uses the “removed” giver notice. Does not ping
organisers.

## Settings — safety

Auth secret status never includes the secret value. Rotating writes
`BETTER_AUTH_SECRET` into `.env`, applies it to the running Better Auth
instance, deletes all `session` rows, and expires cookies. Guest reveal
tokens are not affected.

### `GET|POST /api/settings/safety`

**File:** `app/api/settings/safety/route.ts`  
**Auth:** `admin`  
**GET 200:** `{ source: "BETTER_AUTH_SECRET"|"AUTH_SECRET"|"default", weak }`  
**POST 200:** `{ ok: true, source, weak }` after rotate + sign-out  
**Calls:** `authSecretStatus` / `rotateAuthSecret` (`lib/auth-secret.ts`)

`weak` is true for the `.env.example` placeholder, Better Auth’s built-in
default, or a value shorter than 32 characters.

## Settings — templates

### `GET|PUT /api/settings/templates`

**Auth:** `admin`  
**GET 200:** `TemplatesView` = per-language map of field ids  
**PUT body:** `templatesPatchSchema`  
**400:** placeholder validation (`Invalid placeholder in {language} · {field}: {reason}.`)  
**Calls:** `getTemplates` / `setTemplates` (`lib/templates/reference.ts` via `store.ts`)

This is the committed JSON reference (`lib/templates/defaults/{lang}.json`), not `app_setting`. A save writes those files on disk. Blank fields are stored as empty strings. There is no restore-to-defaults on this page.

Field groups: email, signal, push, reveal. WhatsApp is **not** in this system. Edition copy lives on `GET|PUT /api/e/[code]/templates`.

## Settings — integrations

View never returns secrets: `tokenSet` / `passwordSet`, `source: "db"|"env"|"none"`.

### `GET|PUT /api/settings/integrations`

**Auth:** `admin`  
**PUT body:** `{ whatsapp?, email?, push? }` — `null` clears that integration.
Signal is **not** in this PUT.

### `POST /api/settings/integrations/email/test`

**Auth:** `admin`  
**Body:** `{ to }`  
**409:** `"Email is not configured."`  
**Calls:** `sendEmailTest`

### `POST /api/settings/integrations/push`

**Auth:** `admin`  
Generates and stores VAPID keys. **200:** refreshed `IntegrationsView`.

### `POST /api/settings/integrations/push/test`

**Auth:** `admin`  
**Body:** `{ endpoint }`  
**409:** push not configured / no matching subscription  
**Calls:** `sendPushTest`

### `GET|POST|DELETE /api/settings/integrations/signal`

**Auth:** `admin`  
GET: link status (QR, `linking`, `accountNumber`).  
POST: start device linking. DELETE: unlink.  
**Calls:** `startSignalLink` / `unlinkSignalDevice`

### `POST /api/settings/integrations/signal/test`

**Auth:** `admin`  
**Body:** `{ to }` — `"self"` or a contact id  
**409:** `"Signal is not linked."`  
`SignalUnlinkedError` is a DomainError (`code: "SIGNAL_UNLINKED"`).

### `GET /api/settings/integrations/signal/contacts?sync=1`

**Auth:** `admin`  
**409:** not linked  
**200:** `{ contacts: { id, label, number? }[] }` — excludes blocked and Note to Self

## Push (browser)

### `GET /api/push/vapid`

**Auth:** none (does not use `route()`)  
**200:** `{ publicKey }` — empty string when push is not fully configured

### `POST|DELETE /api/push/subscribe`

**Auth:** `admin`  
**POST body:** `{ endpoint, keys: { p256dh, auth } }` upsert on unique endpoint  
**DELETE body:** `{ endpoint }` (not scoped to the calling user)

## FX and uploads

### `GET /api/fx/convert?amount=&currency=`

**Auth:** `admin`  
Query: `amount` `/^\d+(\.\d{1,2})?$/`, `currency` `EUR|PLN|JPY`  
**200:** `{ EUR, PLN, JPY }`  
**503:** `"Exchange rates are unavailable."`  
**Calls:** `convertEventBudget` (NBP table A, 24h cache)

### `GET /api/uploads/[file]`

**Auth:** none (does not use `route()`)  
Filename must match `^[a-f0-9]{48}\.(jpg|png|webp)$`.  
**200:** raw bytes, `Cache-Control: public, max-age=31536000, immutable`
