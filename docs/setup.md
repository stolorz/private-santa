# Local setup

How to run Private Santa on your machine. Product overview:
[README.md](../README.md). Production hosting:
[deploy/README.md](../deploy/README.md).

## Getting started

Needs **Node.js**. Data is a local SQLite file.

```bash
npm install
cp .env.example .env
#   BETTER_AUTH_SECRET  →  openssl rand -base64 32
#     (or Settings → Safety after you have an organiser account)
#   ADMIN_EMAIL         →  required in production; first signup must match it
#   SQLITE_PATH         →  data/santa.sqlite (default)
#   SMTP_* (optional)        →  require organiser email verification at signup
#   Delivery channels        →  Settings → Integrations (not .env)

npm run db:migrate
npm run dev      # http://localhost:3000
npm run photos:worker   # optional; needed to encode gallery photos
```

Settings → Safety shows whether the app is using `BETTER_AUTH_SECRET` or
`AUTH_SECRET`, and can mint a new random value (writes `.env`, signs you
out). You can still set it by hand with `openssl rand -base64 32`.

When `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` are set, signup
requires email verification before login. That message, and **Forgot
password?** on the log-in page, are sent with the mailbox from
**Settings → Integrations**. The link lifetime and the return to log-in
are in [architecture.md](architecture.md). Create a series from **/events**.

## Production process

`npm run build` then `npm start`. Keep the Node process running so Signal
stay-linked checks and email bounce polling keep running. Job intervals:
[architecture.md](architecture.md).

`NEXT_PUBLIC_APP_URL` is baked into the client at **build time**. Set it
before `npm run build` so guest links use the right domain.

## Backup

Copy `SQLITE_PATH` (default `data/santa.sqlite`), guest and gallery
photos in `data/uploads` (or `UPLOADS_DIR`, including `gallery/`), and,
when you use Signal, the `SIGNAL_STORE_DIR` folder (default `data/signal`).

## Integrations

WhatsApp, Signal, email, and push are configured under
**Settings → Integrations**. A channel sends only when it is configured
and selected for that draw.

**WhatsApp.** A Meta WhatsApp Business template: `{{1}}` the giver's
name, `{{2}}` the private link. Set the token, phone-number id, template
name, and template language in Settings. WhatsApp stays off until the
language is saved.

**Signal.** The app links as a secondary device with
[`go-signal`](https://github.com/CWBudde/go-signal). The Linux or macOS
binary is downloaded into `data/bin/` the first time you click **Link
device**. On the phone: **Signal → Settings → Linked devices → Link new
device**, then scan the QR. The page shows the QR `go-signal` prints and
checks every 2 seconds for a new one. Linking writes a `.linked` marker
under `SIGNAL_STORE_DIR` (default `data/signal`). The Node process runs a
short `go-signal receive` about every 12 hours so Signal keeps the device.
`npm run signal:link` is the same flow from the terminal.

**Email.** SMTP sends the message and IMAP reads bounces. Bounce reading
stays off until an IMAP host is saved. A blank SMTP port connects as 587
and a blank IMAP port as 993. The `SMTP_*` variables in `.env` turn on
organiser verification; invitation mail and password-reset mail use the
mailbox saved in Settings.

**Push.** Generate VAPID keys in Settings and save a subject (`mailto:`
or `https:`). Push stays off until that subject is saved. Then enable
notifications in the Push section.

## Scripts

| Script | What it does |
|:--|:--|
| `npm run dev` | Development server |
| `npm run build` | Production build (`next build --webpack`) |
| `npm start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Apply migrations to the SQLite file |
| `npm run db:push` | Push schema without a migration file |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run signal:link` | Link Signal as a secondary device |
| `npm run photos:worker` | Encode edition gallery AVIF variants (separate process) |
| `npm run email:art` | Render email banner SVGs into `public/email/` |
