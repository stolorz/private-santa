# Live host notes (copy to `ops/README.md`)

`ops/` is gitignored. Put the production host map there so it never lands
on a public repo. This file is only a skeleton.

```bash
mkdir -p ops
cp deploy/ops.example.md ops/README.md
```

Committed docs and tests use the placeholder `/your-prefix`. Put the
**live** public URL and `NEXT_PUBLIC_BASE_PATH` only in `ops/README.md`.

Fill in:

- Public URL and `NEXT_PUBLIC_BASE_PATH`
- SSH user and host (`user@host`)
- App directory, SQLite path, PHP proxy path
- Reverse-proxy layout (what answers 443, what port Node uses)
- rsync commands, including `--exclude ops --exclude .env --exclude data`
- Live PHP proxy constants (`$prefix`, `$backend`, `$forwardedHost`)
- Cron line for `deploy/ensure-running.sh`
- Reminder that production `.env` must set `ADMIN_EMAIL` and a strong
  `BETTER_AUTH_SECRET`
- Reminder that Settings → Templates writes `lib/templates/defaults/*.json`
  on the server until the next `rsync --delete`; commit those files from
  the checkout you edited. Edition templates stay in SQLite.

Do not commit `ops/`.
