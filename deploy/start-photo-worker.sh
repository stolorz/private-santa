#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/opt/bin:$PATH"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a
exec nice -n 10 npm run photos:worker
