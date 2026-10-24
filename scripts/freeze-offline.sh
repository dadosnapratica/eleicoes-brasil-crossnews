#!/bin/bash
# Freeze live capture into an offline snapshot.
# DRY_RUN=1 writes a throwaway snapshot and never flips OFFLINE_MODE.
# FORCE=1 freezes even before the cutoff (do not use on prod before noon).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ROOT="${CROSSNEWS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

ENV_FILE="${CROSSNEWS_ENV_FILE:-$ROOT/.env.production}"
if [ ! -f "$ENV_FILE" ] && [ -f "$ROOT/.env.local" ]; then
  ENV_FILE="$ROOT/.env.local"
fi
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PORT="${PORT:?PORT missing in env}"
CUTOFF_ISO="${OFFLINE_CUTOFF_ISO:-2026-10-24T15:00:00.000Z}"
DRY_RUN="${DRY_RUN:-0}"
FORCE="${FORCE:-0}"
ORIGIN="http://127.0.0.1:${PORT}"

now_epoch=$(date +%s)
cutoff_epoch=$(python3 -c "import datetime; print(int(datetime.datetime.fromisoformat('${CUTOFF_ISO}'.replace('Z','+00:00')).timestamp()))")

if [ "$DRY_RUN" != "1" ] && [ "$FORCE" != "1" ] && [ "$now_epoch" -lt "$cutoff_epoch" ]; then
  echo "refuse: still before cutoff; use DRY_RUN=1 to test" >&2
  exit 2
fi

mkdir -p "$ROOT/data" "$ROOT/public/offline"
if [ "$DRY_RUN" = "1" ]; then
  SNAP="$ROOT/data/offline-snapshot.dryrun.json"
else
  SNAP="$ROOT/data/offline-snapshot.json"
fi

echo "freeze: fetching local feed"
curl -sS --max-time 30 "$ORIGIN/api/feed" -o /tmp/crossnews-feed.json
curl -sS --max-time 30 "$ORIGIN/api/sources" -o /tmp/crossnews-sources.json

python3 - <<PY
import json, re, datetime
from pathlib import Path

leak = re.compile(
    r"(?:192\.168\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|10\.\d+\.|172\.(?:1[6-9]|2\d|3[01])\.)"
    r"|\b127\.0\.0\.1\b|:11434\b|:3013\b|OLLAMA_|gpu-server-01|mac-srv-01|tailscale",
    re.I,
)

def scrub(value):
    if isinstance(value, str):
        return "indisponível" if leak.search(value) else value
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items()}
    return value

feed = scrub(json.loads(Path("/tmp/crossnews-feed.json").read_text()))
if not isinstance(feed, dict) or "clusters" not in feed:
    raise SystemExit("invalid feed snapshot")
sources = json.loads(Path("/tmp/crossnews-sources.json").read_text())
if isinstance(sources, dict) and "sources" in sources:
    feed["sources"] = scrub(sources["sources"])

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
cutoff = "${CUTOFF_ISO}"
feed["archive"] = {"offline": True, "cutoffAt": cutoff, "snapshotAt": now}
out = {"snapshotAt": now, "cutoffAt": cutoff, "feed": feed}
blob = json.dumps(out, ensure_ascii=False)
if leak.search(blob):
    raise SystemExit("refusing snapshot: leak pattern")
Path(r"""${SNAP}""").write_text(blob + "\n", encoding="utf-8")
print("snapshot_items", feed.get("counts", {}).get("factcheck"), "clusters", len(feed.get("clusters", [])))
PY

chmod 644 "$SNAP"
rm -f /tmp/crossnews-feed.json /tmp/crossnews-sources.json

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SHOT="$ROOT/public/offline/ultima-estatistica.png"
if [ "$DRY_RUN" = "1" ]; then
  SHOT="$ROOT/public/offline/ultima-estatistica.dryrun.png"
fi
if [ -x "$CHROME" ]; then
  echo "freeze: screenshot"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1400,1600 --screenshot="$SHOT" "$ORIGIN/" >/dev/null 2>&1 || true
  if [ -f "$SHOT" ]; then
    echo "screenshot_ok"
  else
    echo "screenshot_skip"
  fi
else
  echo "screenshot_skip"
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "dry-run done; not flipping OFFLINE_MODE"
  exit 0
fi

printf '%s\n' "1" "$CUTOFF_ISO" > "$ROOT/data/offline.lock"
chmod 644 "$ROOT/data/offline.lock"

if [ -f "$ENV_FILE" ]; then
  if grep -q '^OFFLINE_MODE=' "$ENV_FILE"; then
    sed -i '' 's/^OFFLINE_MODE=.*/OFFLINE_MODE=1/' "$ENV_FILE"
  else
    printf '\nOFFLINE_MODE=1\n' >> "$ENV_FILE"
  fi
  if ! grep -q '^OFFLINE_CUTOFF_ISO=' "$ENV_FILE"; then
    printf 'OFFLINE_CUTOFF_ISO=%s\n' "$CUTOFF_ISO" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
fi

LABEL="${CROSSNEWS_LAUNCHD_LABEL:-origin-app}"
if command -v launchctl >/dev/null && launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  echo "freeze: restarting origin"
  launchctl kickstart -k "gui/$(id -u)/${LABEL}"
else
  echo "freeze: skip origin restart (no launchd unit ${LABEL})"
fi
echo "freeze: done"
