#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/data/server.pid"
mkdir -p "$ROOT/data"
set -a
# shellcheck disable=SC1091
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a
PORT="${PORT:-3001}"
port_open() {
  (echo >/dev/tcp/127.0.0.1/"$PORT") >/dev/null 2>&1
}

if port_open; then
  exit 0
fi
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0
fi
cd "$ROOT"
nohup "$ROOT/deploy/start-server.sh" >> "$ROOT/data/server.log" 2>&1 &
echo $! > "$PIDFILE"
