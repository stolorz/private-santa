#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDFILE="$ROOT/data/photo-worker.pid"
HEARTBEAT="$ROOT/data/photo-worker.heartbeat"
mkdir -p "$ROOT/data"
set -a
# shellcheck disable=SC1091
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a

heartbeat_fresh() {
  [ -f "$HEARTBEAT" ] || return 1
  now="$(date +%s)"
  stamp="$(tr -d '[:space:]' < "$HEARTBEAT" 2>/dev/null || true)"
  # Node writes milliseconds; accept seconds too.
  if [ "${#stamp}" -gt 10 ]; then
    stamp="$((stamp / 1000))"
  fi
  case "$stamp" in
    ''|*[!0-9]*) return 1 ;;
  esac
  age="$((now - stamp))"
  # GALLERY_HEARTBEAT_STALE_MS (15s) plus one GALLERY_HEARTBEAT_WRITE_MS (5s).
  [ "$age" -ge 0 ] && [ "$age" -le 20 ]
}

if heartbeat_fresh && [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0
fi
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
fi
cd "$ROOT"
nohup "$ROOT/deploy/start-photo-worker.sh" >> "$ROOT/data/photo-worker.log" 2>&1 &
echo $! > "$PIDFILE"
