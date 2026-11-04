#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/opt/bin:$PATH"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a
exec npm start -- -H "${HOSTNAME:-127.0.0.1}" -p "${PORT:-3001}"
