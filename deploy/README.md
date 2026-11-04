# Deployment

Generic steps for running this app behind a reverse proxy. Live host names,
SSH accounts, and directory layouts belong in **`ops/`** (gitignored). Copy
[ops.example.md](ops.example.md) to `ops/README.md` and fill it in.

## How a request reaches Node

Typical production:

1. TLS terminator (nginx, Caddy, Apache, …) answers 443.
2. A path prefix is rewritten to a small proxy (this repo ships
   `santa-app-proxy.php` for Apache).
3. That proxy forwards to Node on `127.0.0.1:${PORT:-3001}`. Next.js
   `basePath` must match the public prefix.
4. Do not bind Node on a public interface. Do not proxy `/` unless the app
   owns the whole domain.

## Layout (placeholders)

| Path | Purpose |
| --- | --- |
| app root | Source, `node_modules`, `.next`, `.env` |
| `data/santa.sqlite` | Live database. Never overwrite while syncing code. |
| `data/server.log` | stdout/stderr of `npm start` |
| `data/server.pid` | Supervisor pid from `ensure-running.sh` |
| web-root proxy | Copy of `deploy/santa-app-proxy.php` with your prefix/host |

**Never overwrite `data/` or `.env` when syncing.**

## Sync

From the laptop repository (adjust `user@host` and the remote path):

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude data \
  --exclude .git \
  --exclude .env \
  --exclude ops \
  -e "ssh -o BatchMode=yes" \
  ./ user@host:secret-santa/
```

If the host cannot run `next build`, build on the laptop with the public
production URLs, then copy `.next`:

```bash
NEXT_PUBLIC_BASE_PATH=/your-prefix \
NEXT_PUBLIC_APP_URL=https://example.com/your-prefix \
BETTER_AUTH_URL=https://example.com/your-prefix \
npm run build

rsync -az --delete -e "ssh -o BatchMode=yes" \
  .next/ user@host:secret-santa/.next/
```

On the server:

| Change | Extra step |
| --- | --- |
| `package.json` | `npm ci --no-audit --no-fund` (never `next build` if the host cannot) |
| Schema | `npm run db:migrate` (also snapshots `event_template` for editions that still have no rows) |
| Settings → Templates | `rsync --delete` overwrites `lib/templates/defaults/*.json`. Commit those files from the checkout you edited. Edition wording is in SQLite, not git. |
| `deploy/santa-app-proxy.php` | Copy into the web root; set `$prefix`, `$backend`, `$forwardedHost` |
| Server process | Stop pid in `data/server.pid`, wait for the port, run `deploy/ensure-running.sh` |

Cron example: `* * * * * /path/to/secret-santa/deploy/ensure-running.sh`

Production `.env` must set `ADMIN_EMAIL`. The first signup has to use that
address. Later signups are rejected.
