#!/usr/bin/env bash
# Build the web client and the referee.
#   scripts/build.sh              web client (apps/web/dist) + cargo build --release
#   scripts/build.sh --web-only   web client only
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/env.sh"

WEB_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --web-only) WEB_ONLY=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node not found; run scripts/bootstrap.sh first" >&2
  exit 1
fi

echo "==> building web client"
cd "$ROOT/apps/web"
if [ ! -d node_modules ]; then
  npm install --no-fund --no-audit
fi
npm run build

if [ "$WEB_ONLY" -eq 0 ]; then
  if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo not found; run scripts/bootstrap.sh first" >&2
    exit 1
  fi
  echo "==> building referee (release)"
  cd "$ROOT"
  cargo build --release
fi
echo "==> build complete"
