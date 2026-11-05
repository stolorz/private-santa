<div align="center">

# WhatsApp Secret Santa

Private Secret Santa draws for a family or office. One organiser account
runs the edition; guests never sign up — they open a private link.

**Next.js 16 · React 19 · Better Auth · SQLite/Drizzle · Tailwind v4**

</div>

---

## How it works

The first account is the organiser. Later sign-ups are rejected. In production, `ADMIN_EMAIL` must be set and that first address has to match it.

A **series** holds dated **editions**. The event list shows a red problem count on each edition: a template that fails validation, a guest with a missing or invalid field, or an Event settings input that is missing or invalid. A new edition copies guests, exclusions, and templates. Wishlists start empty. Saving an edition requires the party date, the Polish, German, Spanish, and Japanese names, all six Polish cases of the event name, and the place. People are reused across editions. The same name with a different phone or email is a different person. A shared number or mailbox warns; the draw still pairs them.

A guest has a name, language (Polish, English, German, Spanish, or Japanese), a required gender, optional phone, email, and photo, plus all six Polish name cases. Saving a guest without a gender or one of those cases is refused. The guest list shows `Gender is required.` until one is set. Invitations wait until every guest has a gender. Wishlist items are text on that guest's reveal page.

Exclusions are forbidden pairs and apply in both directions. Pairing someone with themselves blocks a self-draw for that person. Automatic exclusions (disallow self-draw, avoid past pairings) are saved on the edition from the Exclusions tab and are what the draw uses.

The draw is a backtracking derangement. Self-draw is optional. "Avoid past pairings" is optional and uses earlier editions in the same series; the oldest year drops first when the solver cannot finish. Exclusions always stay. Running the draw again fills empty slots and keeps existing pairs. The organiser starts it from the edition admin. There is no schedule and no public reveal date. On the Draw tab, Export CSV downloads the current pairing list as `draw_results_YYYY.csv` (giver and receiver), using the edition’s party year.

The budget is a required choice on the edition: a positive amount in EUR, PLN, or JPY (the other two amounts come from the NBP rate), make-the-gift with no money, or no spending limit. An empty budget is not a choice. The edition form will not save without one. The draw can still be run first. Invitations stay blocked until a choice is saved, and the guest page shows the matching sentence. Guest messages print that amount with the separators and currency mark of the guest's language. WhatsApp still sends only the name and the link.

The edition also has a place: the name (`Katowice`) and the Polish phrase that answers "gdzie?" with its own preposition (`w Katowicach`, `we Wrocławiu`, `u babci`). Templates use them as `{location}` and `{location_gdzie}`. A new edition copies the place. The form will not save while either one is blank, and invitations wait until both are filled.

The reveal link (`/{token}`) is always created. WhatsApp, Signal, and email send that link when the channel is configured and selected for the draw. Sending stays blocked while any guest in the edition is missing a Polish case, or while the place or the budget choice is missing; the draw itself still runs.

| Channel | What is sent |
|:--|:--|
| **Reveal page** | Unwrap, match, wishlist, and budget. After unwrap, returning guests also see who they gave to in earlier years of the same series. |
| **WhatsApp** | Approved template: `{{1}}` giver's name, `{{2}}` private link. Skips guests with no phone. |
| **Signal** | Greeting plus the private link, from the organiser's linked device. Skips guests with no phone. |
| **Email** | The private link, to the person's email or a linked login email. |

IMAP polling marks bounced mail on the guest list.

When a guest adds, removes, or edits a wish, their Secret Santa gets one short Signal message and one short email, on every channel that can already reach them. Further changes stay quiet until that Santa opens the private page and the list is caught up. The notice names the kind of change and includes the private link. It never names the person receiving the gift.

Push is organiser-only. It fires when a guest opens the link, unwraps the match, adds a wishlist item, or when their santa reads the list.

Copy for email, Signal, push, and the reveal page is editable per language. **Settings → Templates** is the shared reference (committed JSON files under `lib/templates/defaults/`). Those files keep a warm, friendly tone that is easy to understand, and follow official grammar, spelling, and letter-writing rules for each language wherever possible (vocative commas in English, Polish, and Spanish greetings, and German `Hallo {giver}!` without a comma; English targets the British variant — British spelling and grammar, spaced en-dashes, `PS` without periods; Polish and German lowercase after a comma salutation; Spanish colon after the greeting and `P. D.:` with a colon; Polish `PS` without periods). Guests are addressed by first name. `{location}` is typically a city or town name, so non-Polish templates use `in` / `en` / `に` with that name. Tentative phrasing around gathering in `{location}` (such as Japanese `過ごせそうだよ`) and the postal fallback are intentional. Polish `dla jednej wylosowanej osoby` intentionally stresses preparing a single present, and delivered emails are assumed to render the HTML button properly. Casual, friendly Japanese is intentional, and the steps stay simple. Each edition has its own **Templates** tab, filled from the previous edition or from that reference. Restore on an edition copies the current Settings wording into the form. Preview renders the unsaved copy with sample guests and events, in any of the five languages. WhatsApp still uses the Meta template under Integrations. A placeholder that does not parse keeps Save disabled, lists the broken field in red, and blocks invitations until it is fixed. The Templates tab shows a red count of those problem lines on every Settings page and every edition tab. An open draft replaces that count until you leave. Each language button shows the count for that language. With no problem lines, those buttons stay as they are.

A save on Settings → Templates writes those JSON files on the running machine. On production that lasts until the next `rsync --delete` from the laptop, so commit the JSON from the checkout you edited. Edition wording lives in the database and is not in git.

---

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
```

Production: `npm run build` then `npm start`. Keep the Node process running so Signal stay-linked checks and email bounce polling keep running.

**Backup:** copy `SQLITE_PATH` (default `data/santa.sqlite`), guest photos in `data/uploads` (or `UPLOADS_DIR`), and, when you use Signal, the `SIGNAL_STORE_DIR` folder.

`NEXT_PUBLIC_APP_URL` is baked into the client at **build time** — set it before `npm run build` so guest links use the right domain.

When `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` are set in `.env`, signup requires email verification before login. That message is sent with the mailbox from **Settings → Integrations**. **Forgot password?** on the log-in page uses the same mailbox. The link expires in one hour; after choosing a new password, log in again. Create a series from **/events**.

**Auth secret:** Settings → Safety shows whether the app is using `BETTER_AUTH_SECRET` or `AUTH_SECRET`, and can mint a new random value (writes `.env`, signs you out). You can still set it by hand with `openssl rand -base64 32`.

---

## Integrations

WhatsApp, Signal, email, and push are configured under **Settings → Integrations**. A channel sends only when it is configured and selected for that draw.

**WhatsApp.** A Meta WhatsApp Business template with the two parameters above. Set the token, phone-number id, template name, and template language in Settings. WhatsApp stays off until the language is saved.

**Signal.** The app links as a secondary device with [`go-signal`](https://github.com/CWBudde/go-signal). The Linux or macOS binary is downloaded into `data/bin/` the first time you click **Link device**. On the phone: **Signal → Settings → Linked devices → Link new device**, then scan the QR. The page shows the QR `go-signal` prints and checks every 2 seconds for a new one. Linking writes a `.linked` marker under `SIGNAL_STORE_DIR` (default `data/signal`). The Node process runs a short `go-signal receive` about every 12 hours so Signal keeps the device. `npm run signal:link` is the same flow from the terminal.

**Email.** SMTP sends the message and IMAP reads bounces. Bounce reading stays off until an IMAP host is saved. A blank SMTP port connects as 587 and a blank IMAP port as 993. The `SMTP_*` variables in `.env` turn on organiser verification; invitation mail and password-reset mail use the mailbox saved in Settings.

**Push.** Generate VAPID keys in Settings and save a subject (`mailto:` or `https:`). Push stays off until that subject is saved. Then enable notifications in the Push section.

---

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
| `npm run email:art` | Render email banner SVGs into `public/email/` |

Repo rules: [AGENTS.md](AGENTS.md). Architecture, API, and domain reference: [docs/README.md](docs/README.md).

---

## License

MIT — see [LICENSE](LICENSE). The optional Signal sidecar ([go-signal](https://github.com/CWBudde/go-signal)) is AGPL-3.0.
