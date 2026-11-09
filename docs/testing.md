# Testing

Vitest, Node environment (jsdom only for `*.test.tsx`). Script: `npm test`
(`vitest run`). Coverage: `npm run test:coverage`.

There is no second fake DB. Production Drizzle code hits an in-memory
SQLite that has run the real `drizzle/` migrations.

## Layout

| Path | Role |
|---|---|
| `vitest.config.ts` | Alias `@` → repo root. `setupFiles: test/setup.ts`. Excludes `.next/` and `data/`. Node by default; `*.test.tsx` files set `/** @vitest-environment jsdom */` |
| `test/setup.ts` | Mocks `server-only`. Mocks `react.cache` as identity. `afterEach`: unstub env, restore mocks, `resetRateLimit()`, `mockDb.reset()`, `resetSettingsCache()`, `resetTemplateDefaultsCache()` |
| `test/helpers/db.ts` | In-memory `better-sqlite3` + migrator. `seed` / `add` / `rows` / `reset`. FK off during seed |
| `test/helpers/fixtures.ts` | Factories: `makeUser`, `makeSeries`, `makeEvent`, `makeEventTemplate`, `makeEventPhoto`, `makeEventPhotoVariant`, `makePerson`, `makeGuest`, `makeSeat`, `makeDraw`, `makeAssignment`, `eventLocation` (filled place fields), … Stable `FIXTURE_NOW` / `FIXTURE_EVENT_CODE` |
| `test/helpers/gallery.ts` | Tiny JPEG/PNG/WebP buffers, EXIF-oriented JPEGs, HEIC `ftyp` boxes, temp `UPLOADS_DIR` |
| `test/helpers/template-defaults.ts` | `useTempTemplateDefaults()` copies the committed JSON into a temp dir so `setTemplates` cannot write git files |
| `test/helpers/session.ts` | `sessionMockModule()`, `asAdmin()`, `asUser()`, `asAnonymous()` for `vi.mock("@/lib/session")` |
| `test/helpers/request.ts` | `NextRequest` builders: `emptyRequest`, `jsonRequest`, `formRequest`, `jpegForm`, `routeParams`, `codeParams`, `tokenParams` |

Tests sit next to sources: `lib/foo.test.ts`, `app/api/…/route.test.ts`,
`hooks/use-mutation.test.tsx`.

## How to add a test

1. Collocate `foo.test.ts` next to `foo.ts`.
2. `vi.mock("@/lib/db", () => mockLibDb())` when the module touches the DB.
3. Organiser routes: `vi.mock("@/lib/session")` + `asAdmin()` / `asAnonymous()`.
4. External I/O: mock nodemailer, `web-push`, `qrcode`, Better Auth,
   go-signal spawn/fetch, WhatsApp `fetch`, `imapflow`.
5. Prefer asserting DB rows (`invitation_send`, assignment flags) over
   mocking every collaborator.
6. Production test hooks already exist: `setGoSignalSpawn`, `setGoSignalFetch`,
   `setFxFetch`, `setFxNow`, `resetFxInflight`, `resetSignalLinkState`,
   `setSettingMapLoad`, `setRateLimitNow`, `resetRateLimit`, `resetMailClient`.
7. Tests that call `setTemplates` must call `useTempTemplateDefaults()` first.
   Vitest refuses to write the committed JSON files without that.

Do not boot Better Auth for unit tests. Auth behaviour lives in
`lib/auth-hooks.ts` and `lib/signup.ts`.

## Coverage

```bash
npm run test:coverage
```

Include: `lib/**/*.ts`, `app/api/**/*.ts`, `hooks/**/*.ts`, `instrumentation.ts`.

Thresholds on that set: **100% statements / functions / lines / branches**.

Allowed excludes (do not silently widen):

- `**/*.test.ts`, `**/*.test.tsx`
- `**/*-types.ts` (types-only)
- `lib/phone-send.ts` (shared send payload types)
- `lib/db/schema.ts` (table definitions; exercised by migrations)
- `components/ui/**` (shadcn primitives)
- `components/festive/**` (atmosphere)
- `scripts/render-email-art.tsx`
- `scripts/signal-link.ts` (CLI; `lib/signal-link` is tested)
- `scripts/migrate.ts` (squash sentinels; run against real DBs)
- `deploy/**`
- `.next/**`, `data/**`

If a new file cannot honestly hit 100% (live network, OS binary), extract
the pure logic and test that. Do not lower the threshold to hide a gap.

Interactive UI uses jsdom via `/** @vitest-environment jsdom */` at the top
of the file (Vitest 4 dropped `environmentMatchGlobs`). Covered today:
`hooks/use-mutation.ts`, login and signup forms, event-admin tabs (guests,
exclusions, draw, delivery, photos, pair picker, confirm, reveal links,
send-panel, nav), guests editor and shared-contact, events manager / settings /
push toggle, guest reveal page (wishlist vs photos), guest gallery page
(including an empty gallery after the party), organiser Photos page,
wishlist-editor closed-date errors, photo-worker SIGTERM / SIGINT,
reveal unwrap, previous-years, gallery grid, lightbox, wishlist, settings (integrations, templates,
people, safety, nav), layout chrome, and inputs (phone, names, photo
cropper, person picker). `WinterPage` `wide` is covered. Do not start with `components/ui/*`
or other `components/festive/*` atmosphere.

## Out of unit-test scope

- Live Meta / IMAP / Signal network
- PHP/shell under `deploy/` — operational; live host map is `ops/` (gitignored)
- `scripts/migrate.ts` sentinel workarounds for pre-squash journals
- Decorative festive visuals and shadcn primitives

## Patterns that already exist

- Channel adapters mocked at the module boundary in draw/send tests;
  delivery still asserted via DB rows.
- `lib/draw.test.ts` is the spec for leftover bipartite draws, history
  drop-oldest, and exclusion feasibility.
- `lib/templates.test.ts` is the spec for interpolate / gender / Polish count.
- `lib/templates/reference.test.ts` is the spec for the committed JSON files
  and Settings → Templates disk writes (always against a temp copy).
- `lib/templates/store.test.ts` is the spec for `event_template` snapshots,
  `materializeMissingEventTemplates`, and guest-page copy (edition rows vs
  JSON reference on an invalid link).
- `lib/pairings.test.ts` covers Draw-tab reveal-link blocks that follow
  this edition's email/Signal templates.
- `lib/email-bounce.test.ts` parses DSN fixtures; IMAP is mocked.
- `lib/event-code.test.ts` walks `app/` so a new static route cannot
  silently collide with guest tokens.
