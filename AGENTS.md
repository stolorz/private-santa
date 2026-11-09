# Agent handbook

Private Santa for one organiser. Guests never create accounts — they
open a private `/{token}` link. The product pitch is in [README.md](README.md).
Local setup is in [docs/setup.md](docs/setup.md). Deep reference is in
[docs/](docs/README.md).

## What this is

- **One organiser** (Better Auth, `user.role === "admin"`). The first sign-up
  becomes admin; later sign-ups are rejected. When `ADMIN_EMAIL` is set, that
  first address must match it. Production requires `ADMIN_EMAIL`.
- **People** are durable identities (name, contact, photo, optional login).
  **Guests** are per-edition seats. Wishlists hang off the seat, not the person.
- **Editions** belong to a **series**. URLs use a 6-character `event.code`,
  never the series slug. Guest portals use a 6-character `assignment.revealToken`.
- There is **no middleware**. Pages call `requireAdminPage()`. APIs use
  `route({ auth })` from `lib/api.ts`.

## Non-negotiable invariants

Do not break these. Tests encode most of them.

1. **Exclusions are hard and symmetric.** Stored with `aId <= bId`. Pairing
   someone with themselves forbids a self-draw for that person.
2. **Past pairings are soft.** `avoidPastPairings` loads earlier editions in
   the same series (remap by `personId`). Oldest year drops first if the
   solver cannot finish. Exclusions never drop. The live choice (`allowSelfDraw`,
   `avoidPastPairings`) is stored on the edition and copied onto the draw.
3. **One current draw per edition.** Newest `draw` row is *the* lottery.
   `POST /draw` fills leftover slots; existing pairs and tokens stay.
4. **Perfect matching.** Unique giver and unique receiver per draw.
5. **Completed-draw protection.** Cannot delete a person, guest seat, or
   edition that has a completed draw.
6. **Tokens vs codes.** Event codes and reveal tokens are 6 chars `[0-9a-z]`.
   Guest page is `/{token}`. Minting skips reserved first segments in
   `lib/ids.ts` (`login`, `signup`, `events`, `settings`, `e`, `api`, `_next`).
   Adding a new root route means updating that set and its test.
7. **Person vs guest.** Identity vs seat. Edition copy and history remap join
   on `personId`. Wishlists are **not** copied to a new edition. Templates
   **are** copied from the previous edition (or snapshotted from Settings
   → Templates when there is no previous copy).
8. **Contact sharing is allowed** (spouses, children). UI warns; draw does
   not care. Phone/email are not unique.
9. **WhatsApp copy is Meta-side** (`{{1}}` name, `{{2}}` URL). Signal, email,
   push, and reveal copy live in `lib/templates`. Settings → Templates is
   the committed JSON under `lib/templates/defaults/`. Each edition stores
   its own copy in `event_template`. Guest-facing send/reveal/push use the
   edition rows. Restore on an edition tab copies the current Settings JSON.
   Wishlist-change notices to the giver (Signal and email, added / removed /
   changed) use those edition rows too. They must not name the receiver or
   quote the wish. Invitation send does not require the notice fields.
   Reference wording in `lib/templates/defaults/` keeps a warm, friendly
   tone that is easy to understand, and follows official grammar, spelling,
   and letter punctuation for each language wherever possible (vocative
   commas in English, Polish, and Spanish greetings, and German
   `Hallo {giver}!` without a comma; English targets the British
   variant — British spelling and grammar, spaced en-dashes, `PS` without
   periods; Polish and German lowercase after a comma salutation; Spanish
   colon after the greeting and `P. D.:` with a colon; Polish `PS` without
   periods). Guests are addressed by first name, so informal greetings like
   Polish `Cześć` are intentional. `{location}` is typically a city or town
   name, so `in {location}` / `en {location}` / `{location}に` in
   non-Polish templates is intentional (`{location_gdzie}` still carries
   the Polish preposition). Tentative phrasing about gathering in
   `{location}` (including Japanese `過ごせそうだよ`) and the note about
   sending presents by post are intentional. Polish `dla jednej
   wylosowanej osoby` (`jednej`) is intentional: each participant prepares
   only a single present. Casual, friendly Japanese is intentional, and
   the instructions stay simple. Delivered emails are assumed to render
   the HTML `{button}` properly, so "click/press the button below" plus
   the PS fallback link is intentional (do not flag plain-text `{button}`
   rendering as a copy issue). The HTML mail renderer may still promote
   that greeting line to a heading. Before reviewing or changing template
   wording, read `PRIVATE_CONTEXT.md` when that file is present. It holds
   local product rationale and must never be committed.
10. **Settings blank = delete** for integrations. WhatsApp, invitation email,
    and push credentials live in `app_setting` only (Settings → Integrations).
    Secrets never round-trip to the admin UI (`tokenSet` / `passwordSet`).
    Env `SMTP_*` is a boot-time switch for organiser email verification,
    not the mailbox used to send mail. Template blanks are stored as empty
    strings (JSON reference or `event_template`), not deleted keys.
11. **`DomainError` is the HTTP contract.** Subclasses map to `{ error }` JSON.
    Do not leak internals.
12. **Signup is first-organiser only.** Better Auth’s own sign-up stays
    closed via `user.create.before` after the first user. If `ADMIN_EMAIL`
    is set, the first address must match it (generic error; never echo the
    expected mailbox). Production refuses signup when `ADMIN_EMAIL` is blank.
    Env SMTP (`SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM`) also
    requires email verification before login.
13. **Reveal OG must not include the receiver name** (crawlers would spoil
    the draw). Title, description, and image text are localized to the
    giver's language and never include giver, receiver, or edition names.
    Open/unwrap pings are idempotent.
14. **Signal CLI is mutexed.** One local store; unlink wipes `SIGNAL_STORE_DIR`
    but refuses `/` and cwd.
15. **Email bounces** match `X-Santa-Token` / `<santa.{token}@…>` first, then
    the newest completed assignment for that recipient email
    (`draw.executedAt`). The Integrations test token is ignored and does
    not fall back.
16. **`fetch("/api/…")` ignores Next `basePath`.** Always use `apiPath()`,
    `eventApiPath()`, `revealApiPath()`, `galleryMediaPath()`,
    and `adminGalleryMediaPath()` from `lib/public-path.ts`. Guest gallery
    pages use `galleryPath()` in `<Link>` (Next prefixes `basePath`).
17. **Budget is an explicit choice.** `amount` (positive, with EUR/PLN/JPY
    extras that match the primary currency; FX is NBP Table A via PLN),
    `zero` (make the gift, no money), or `unlimited` (no spending limit).
    An edition save cannot leave the choice unset. The draw may run before
    a choice exists; invitations cannot. WhatsApp still sends only the
    name and link.
18. **Rate limits** (in-memory, one Node process). Sign-in and password-reset
    requests share 5 / 15 min / IP; signup 5 / hour / IP; reveal POSTs
    120 / 5 min / IP. Setting a new password is not limited. No `middleware.ts`.
    Multi-process deploys would need a shared store.
19. **Location gates saves and invitations.** `location` is the place name;
    `locationGdzie` is the Polish phrase with its own preposition
    (`w Katowicach`, `u babci`), never derived. Create may leave them
    blank; an edition update refuses to leave either one blank, like the
    translations. Invitations and the reveal-link copy wait for both.
20. **Gender is required.** `female` or `male` on a person. The column stays
    nullable for the organiser created at signup and older rows. A person
    or guest save is refused without one (`Gender is required.`). The guest
    and people lists show that error on the collapsed row. Invitations and
    the reveal-link copy wait until every seated guest has a gender; the
    error names those guests. Do not rely on a gender-select fallback in
    templates to paper over a missing value.
21. **Invalid templates block send.** Any placeholder that does not parse
    (unknown name, gender fallback, unclosed brace, a token that field
    forbids, …) on an edition template disables invitations, including
    WhatsApp-only, and reveal-link copy. The template editor (Settings and
    the edition tab) shows a counted red summary, a problem list naming
    language, field, and the broken token, a red border on the field, and
    a disabled Save with the reason. Save APIs refuse the same errors.
22. **Edition galleries sit behind the reveal token.** The organiser uploads
    on the Photos tab (far right of edition admin). A separate `photos:worker`
    process encodes AVIF `thumb` / `hd` / `fhd` / `uhd`. Guests see a photo
    only after `thumb` is `done`. A token may open its own edition only
    after that edition’s party date is past (next UTC day, same as
    `isOccursOnPast`), or an earlier series edition where that person
    was a giver (an `EXISTS` equivalent to the set
    `listPastGiftsForGiverOn` returns). Every other request is
    `"This link is invalid."`. Photos are not copied to
    a new edition. Deleting an edition removes its gallery folders. The
    guest reveal page hides this year’s photos until then and keeps the
    giver’s wishlist editor; afterwards the editor is gone and a photos
    link shows only when ready thumbnails exist. Previous-year photo
    links stay. Wishlist add / edit / delete then return
    `"The wishlist cannot be changed after the event date."`

## Where to edit

| Area | Path | Notes |
|---|---|---|
| Public pages | `app/(public)/` | `/`, `/login`, `/signup`, `/{token}`, `/{token}/photos/{code}`. Parentheses are not URLs. |
| Organiser pages | `app/(admin)/` | `/events`, `/e/[code]/admin/*`, `/settings/*` |
| JSON API | `app/api/` | Thin wrappers over `lib/`. Use `route({ auth })`. |
| Domain | `lib/` | See [docs/domain.md](docs/domain.md) |
| Template defaults | `lib/templates/defaults/*.json` | Settings → Templates writes these files |
| UI | `components/` | Feature folders: `event-admin`, `guests`, `reveal`, `settings`, `events`, `layout`, `festive`, `inputs`, `ui` |
| Tests | `*.test.ts` next to source | In-memory SQLite. See [docs/testing.md](docs/testing.md) |
| Schema | `lib/db/schema.ts` + `drizzle/` | `npm run db:generate` then `db:migrate` |
| Background jobs | `instrumentation.ts` → `lib/background-jobs.ts` | Signal keep-alive 12h, IMAP bounce poll 60s. Photo encoding is a separate `npm run photos:worker` process |

Do not add a second copy of pages outside the route groups. Legacy URLs
(`/admin`, `/dashboard`, `/groups`, `/g/:slug`) redirect to `/events` in
`next.config.ts`. `/e/:code/dashboard` redirects to `/e/:code/admin`.

## API conventions

`route({ auth, body?, id?, invalid?, rateLimit? }, handler)` in `lib/api.ts`:

| `auth` | Who | Failure |
|---|---|---|
| `public` | Anyone | — |
| `user` | Any signed-in user | 401 |
| `admin` | `role === "admin"` | 401 anonymous, 403 signed-in non-admin |
| `eventAdmin` | Admin + `params.code` is a real edition | 401 / 403 / 404 `"Unknown event."` |
| `guest` | Valid `params.token` | 404 `"This link is invalid."` |

Errors are always `{ "error": "<message>" }`. `DomainError.status` becomes
the HTTP status (default 400). Numeric `params.id` goes through
`parseRouteId` (`/^[1-9]\d*$/`). Catalog: [docs/api.md](docs/api.md).

## Tests and coverage bar

```bash
npm test              # vitest run
npm run test:coverage # vitest run --coverage (must pass thresholds)
npm run typecheck
npm run lint
```

- New `lib/` or `app/api/` code ships with a collocated `*.test.ts`.
- Reuse `test/helpers/{db,fixtures,session,request}.ts`. Do not invent a
  second fake DB.
- Coverage include: `lib/**/*.ts`, `app/api/**/*.ts`, `hooks/**/*.ts`,
  `instrumentation.ts`.
- Thresholds on that set: **100% statements / functions / lines /
  branches**.
- Do not silently widen the coverage exclude list. Allowed excludes are
  listed in [docs/testing.md](docs/testing.md) (`*.test.ts`, `*-types.ts`,
  `lib/phone-send.ts`, `lib/db/schema.ts`, festive/shadcn UI, `deploy/`,
  email-art script).
- New interactive UI needs a `*.test.tsx` (jsdom). Do not add tests for
  `components/ui/*` primitives or `components/festive/*` atmosphere.

## Keep docs current

In the **same change** as the code:

| You changed | Update |
|---|---|
| Route, auth mode, request/response | `docs/api.md` |
| Table, unique constraint, person/guest rule | `docs/data-model.md` |
| `lib/` module, solver, delivery, templates | `docs/domain.md` |
| Page, layout, component ownership | `docs/architecture.md`, `docs/ui.md` |
| Test helper, coverage include/exclude | `docs/testing.md` |
| Invariant, deploy step, coverage bar | this file |
| Product feature visible to humans | `README.md` |
| Local setup, scripts, backup, integration how-to | `docs/setup.md` |

Do not let README, AGENTS.md, and `docs/` disagree.

## What is public vs private

| Commit | Do not commit |
|---|---|
| App source, tests, generic `deploy/` scripts | `.env`, `.env.local` |
| `.env.example` (localhost placeholders) | `data/` (SQLite, Signal store, photos) |
| `deploy/ops.example.md` (skeleton) | `ops/` (live host map, SSH, rsync, public URL, `NEXT_PUBLIC_BASE_PATH`) |
| Public template rules in this file | `PRIVATE_CONTEXT.md` (local rationale for template wording) |

Public deploy steps: [deploy/README.md](deploy/README.md). Live host notes:
`ops/` (gitignored). Copy [deploy/ops.example.md](deploy/ops.example.md) to
`ops/README.md` on the machine that deploys. `PRIVATE_CONTEXT.md`
(gitignored) explains local template choices. Read it before reviewing or
changing that wording, when the file is present, and do not commit it.

## Pointers

| Doc | What |
|---|---|
| [docs/README.md](docs/README.md) | Index |
| [docs/setup.md](docs/setup.md) | Local setup, backup, integrations, scripts |
| [docs/architecture.md](docs/architecture.md) | Routes, auth, flows, `basePath` |
| [docs/data-model.md](docs/data-model.md) | Tables and invariants |
| [docs/api.md](docs/api.md) | HTTP catalog |
| [docs/domain.md](docs/domain.md) | `lib/` map and algorithms |
| [docs/ui.md](docs/ui.md) | Component map |
| [docs/testing.md](docs/testing.md) | Vitest, helpers, coverage |
