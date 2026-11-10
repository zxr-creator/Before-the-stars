#!/usr/bin/env bash
# Build the web client and the referee.
#   scripts/build.sh              web client (apps/web/dist) + cargo build --release
#   scripts/build.sh --web-only   web client only
#   scripts/build.sh --wasm       first build the WebAssembly referee (scripts/build-wasm.sh),
#                                 so this client can also run without the server: open it
#                                 with ?local in the URL. May be combined with --web-only.
#
# The browser game for GitHub Pages is a separate build: scripts/build-pages.sh.
# A client built while apps/web/wasm/bts.wasm exists always carries the module.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/env.sh"

WEB_ONLY=0
WASM=0
for arg in "$@"; do
  case "$arg" in
    --web-only) WEB_ONLY=1 ;;
    --wasm) WASM=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node not found; run scripts/bootstrap.sh first" >&2
  exit 1
fi

if [ "$WASM" -eq 1 ]; then
  "$ROOT/scripts/build-wasm.sh"
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
  # The game's own window uses the system web view (macOS, Windows). On Linux build the
  # headless referee, which serves the same game to a browser, unless BTS_DESKTOP=1.
  if [ "$(uname -s)" = "Linux" ] && [ "${BTS_DESKTOP:-0}" != "1" ]; then
    cargo build --release --no-default-features -p bts-server
  else
    cargo build --release
  fi
fi
echo "==> build complete"
