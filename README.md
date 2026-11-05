<div align="center">

# Private Santa

Private Secret Santa draws for a family or office. One organiser account
runs the edition; guests never sign up — they open a private link.

**Next.js 16 · React 19 · Better Auth · SQLite/Drizzle · Tailwind v4**

</div>

## Features

- A series of dated editions. People carry over; each year starts with an empty wishlist.
- Exclusions in both directions, with optional self-draw and “avoid last year’s pairs”.
- A private page per guest: unwrap the match, write a wishlist, see the budget, and look back at earlier years.
- Send that link by WhatsApp, Signal, or email. A wishlist change notifies their Secret Santa.
- Copy in Polish, English, German, Spanish, and Japanese.

## Quick start

Needs **Node.js**. Data is a local SQLite file.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev      # http://localhost:3000
```

Env, backup, integrations, and scripts: [docs/setup.md](docs/setup.md).
Production: [deploy/README.md](deploy/README.md).

## Docs

Product rules: [AGENTS.md](AGENTS.md).
Local setup: [docs/setup.md](docs/setup.md).
Code reference: [docs/README.md](docs/README.md).

## License

MIT — see [LICENSE](LICENSE). The optional Signal sidecar ([go-signal](https://github.com/CWBudde/go-signal)) is AGPL-3.0.
