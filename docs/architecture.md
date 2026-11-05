# Architecture

Next.js 16 App Router, React 19, Better Auth, SQLite/Drizzle, Tailwind v4.
Single-tenant: one organiser account runs editions; guests use a private link.

There is **no `middleware.ts`**. Auth is opt-in on each page and API route.

## Route groups

Parentheses never appear in URLs. `app/(admin)/events/page.tsx` is `/events`.

| Group | URL prefix | Chrome |
|---|---|---|
| `app/(public)` | none | Winter scene / centered card, no organiser nav |
| `app/(public)/(auth)` | none | Nested group only. Pages are still `/login`, `/login/forgot`, `/login/reset`, and `/signup` |
| `app/(admin)` | none | `FestiveAtmosphere` snow overlay. **Does not check auth.** |
| `app/api` | `/api` | JSON |

Root layout (`app/layout.tsx`): fonts, OG metadata, `JapaneseFontLoader`. No nav.

### Public pages

| URL | File | Auth |
|---|---|---|
| `/` | `app/(public)/page.tsx` | Public. Logged-in → `/events`. CTA is signup if no organiser exists, else login |
| `/login` | `app/(public)/(auth)/login/page.tsx` | Public. Success → `/events`. Links to forgot password |
| `/login/forgot` | `app/(public)/(auth)/login/forgot/page.tsx` | Public. Always shows check-email after a request |
| `/login/reset` | `app/(public)/(auth)/login/reset/page.tsx` | Public. `?token=` from the email redirect, or `?error=INVALID_TOKEN`. Success returns to `/login` |
| `/signup` | `app/(public)/(auth)/signup/page.tsx` | Public, first user only. Form POSTs `/api/signup` (not Better Auth `signUp`) |
| `/{token}` | `app/(public)/[token]/page.tsx` | Token. Valid: edition templates, localized OG in the giver's language (no names), `robots: noindex`. Invalid: JSON reference copy, site OG, not Next.js 404 |

Guest tokens are 6-char `[0-9a-z]`. Minting skips reserved first
segments (`login`, `signup`, `events`, `settings`, `e`, `api`, `_next`) in
`lib/ids.ts`.

### Organiser pages

| URL | File | Auth |
|---|---|---|
| `/events` | `app/(admin)/events/page.tsx` | Signed in. Non-admin sees “Guests don’t log in…”. Admin sees `EventsManager`, with a red problem count on each edition that has one |
| `/e/[code]/admin` | `…/admin/layout.tsx` + `page.tsx` | `requireAdminPage()`. Unknown code → `notFound()` |
| `/e/[code]/admin/templates` | `…/admin/templates/page.tsx` | admin |
| `/e/[code]/admin/guests` | `…/admin/guests/page.tsx` | admin |
| `/e/[code]/admin/exclusions` | `…/admin/exclusions/page.tsx` | admin |
| `/e/[code]/admin/draw` | `…/admin/draw/page.tsx` | admin |
| `/e/[code]/admin/delivery` | `…/admin/delivery/page.tsx` | admin |
| `/settings` | `app/(admin)/settings/page.tsx` | Redirect → `/settings/integrations` |
| `/settings/integrations` | `…/integrations/page.tsx` | `requireAdminPage()` via settings layout |
| `/settings/templates` | `…/templates/page.tsx` | admin |
| `/settings/people` | `…/people/page.tsx` | admin (people list is RSC; no `GET /api/people`) |
| `/settings/safety` | `…/safety/page.tsx` | admin |

PWA `start_url` is `/events` (`app/manifest.ts`).

Event admin tabs (`components/event-admin/admin-nav.tsx`): General,
Templates, Guests, Exclusions, Draw, Delivery. Settings tabs: Integrations,
Templates (JSON reference for all editions), Guests (people directory),
Safety.

### Legacy redirects (`next.config.ts`)

`/admin`, `/dashboard`, `/groups`, `/g/:slug/:path*` → `/events`.
`/e/:code/dashboard` → `/e/:code/admin`.

Local `next dev` also sets `allowedDevOrigins: ["127.0.0.1"]` so opening
`http://127.0.0.1:3000` still loads `/_next` JS. Without that, the login
form never hydrates and submits as `GET /login?`.

## Auth

Better Auth (`lib/auth.ts`): email/password. `requireEmailVerification` is
on only when env SMTP is complete (`SMTP_HOST` + `SMTP_USER` + `SMTP_PASS`
+ `SMTP_FROM`) — a boot-time switch, not the sending mailbox. Verification,
password reset, and invitation mail use Settings → Integrations. A reset
link lasts one hour (Better Auth's default). Choosing a new password
revokes existing sessions and does not sign the organiser in. Drizzle SQLite
adapter + admin plugin + `nextCookies()` last. `baseURL` is origin-only
(`publicOrigin()`) so Better Auth still appends `/api/auth` when the app is
under a `basePath`.

`user.create.before` rejects anyone after the first user, and rejects the
first user when `ADMIN_EMAIL` is set and the address does not match (or when
production has no `ADMIN_EMAIL`). The first allowed user is always admin.
`user.create.after` calls `insertOrganiserPerson` with the pending name,
phone, and email from `lib/signup-pending.ts` when signup went through
`/api/signup`. If that hook did not take the pending details,
`signupFirstOrganiser` inserts the same row.

Session (`lib/session.ts`): `getCurrentUser()` is request-cached.
`requireAdminPage()`: anonymous → `/login`; `role !== "admin"` → `/events`.

| Actor | Entry | Can do |
|---|---|---|
| Organiser (admin) | `/signup` once (email verify if env SMTP is set), then `/login` | Events, edition admin, settings, PWA push |
| Signed-in non-admin | leftover `role: "user"` | `/events` empty copy. `GET /api/events` returns `[]` |
| Guest | `/{token}` | Reveal + own wishlist; previous years after unwrap if they gave before. No account |

API 401 vs 403: anonymous → 401; signed-in non-admin → 403.

## Flows

### Organiser

```
/ → /signup (once; check email if env SMTP) or /login → /events
                                 ├─ create series or edition
                                 ├─ /e/:code/admin          general (name, date, budget)
                                 ├─ /e/:code/admin/templates
                                 ├─ /e/:code/admin/guests
                                 ├─ /e/:code/admin/exclusions
                                 ├─ /e/:code/admin/draw     run leftover fill, export CSV
                                 └─ /e/:code/admin/delivery send invitations
                            /settings/{integrations,templates,people,safety}
```

Draw mints a 6-char `revealToken` per assignment. Delivery builds
`guestPortalUrl` → `{origin}{basePath}/{token}`.

### Guest

```
/{token}
  GET page                          greeting, unwrap, own wishlist, previous years after unwrap; OG in giver language
  POST /api/reveal/:token/open      first browser open (organiser push)
  POST /api/reveal/:token           unwrap → { match } (no contact)
  GET/POST/PATCH/DELETE /api/reveal/:token/wishlist*
```

Open / unwrap / wishlist-seen are `auth: "public"` plus a token lookup so
crawler pings stay idempotent. Wishlist mutate uses `auth: "guest"`.

## `basePath`

Production sets `NEXT_PUBLIC_BASE_PATH` to a path prefix (placeholder in
this repo: `/your-prefix`). The live value belongs in gitignored `ops/`.

- Next.js `basePath` in `next.config.ts` prefixes pages and static assets.
- `fetch("/api/…")` does **not** get the prefix. Use `apiPath` /
  `eventApiPath` / `revealApiPath` / `photoUrl` from `lib/public-path.ts`.
- Better Auth handler (`app/api/auth/[...all]/route.ts`) restores the prefix
  Next strips from `request.url` (`withAuthPath`).
- `NEXT_PUBLIC_APP_URL` is baked into the client at **build time**.

## Layout shells

| Shell | File | Used by |
|---|---|---|
| `PageShell` | `components/layout/page-shell.tsx` | Admin pages (`max-w-2xl`) |
| `CenteredCard` | same | Login / signup |
| `WinterPage` / `WinterCard` | `components/festive/winter-page.tsx` | Home, reveal, auth. `contained` clips the sky inside the template preview |
| `FestiveAtmosphere` | `components/festive/festive-atmosphere.tsx` | All `(admin)` pages |
| `PageHeader` | `components/layout/page-header.tsx` | Event admin + settings titles |
| `TabNav` | `components/layout/tab-nav.tsx` | Shared segmented tabs |

## Background jobs

`instrumentation.ts` `register()` starts jobs only when
`NEXT_RUNTIME=nodejs` and not `phase-production-build`.

| Job | First delay | Interval |
|---|---|---|
| `keepSignalLinked` (`go-signal receive`) | 30s | 12h |
| `pollEmailBounces` | 8s | 60s |

Keep the Node process running in production so these stay alive.

## Deploy

Typical production: TLS terminator → optional PHP/path proxy → Node on
`127.0.0.1:${PORT:-3001}`. Public steps: [deploy/README.md](../deploy/README.md).
Live host map: `ops/` (gitignored). See [AGENTS.md](../AGENTS.md).
