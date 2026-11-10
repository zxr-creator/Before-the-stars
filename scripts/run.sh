#!/usr/bin/env bash
# Start the local referee and serve the web client. Extra arguments are passed
# to `bts serve` (for example: scripts/run.sh --port 7979 --fresh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/env.sh"

if [ ! -x "$ROOT/target/release/bts" ] || [ ! -f "$ROOT/apps/web/dist/index.html" ]; then
  "$ROOT/scripts/build.sh"
fi

# Relative defaults (web client, saves) resolve against the repository root.
cd "$ROOT"
exec "$ROOT/target/release/bts" serve "$@"
