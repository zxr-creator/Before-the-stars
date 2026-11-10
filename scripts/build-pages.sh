#!/usr/bin/env bash
# Build the browser game: a static site that needs no server (the GitHub Pages build).
#
#   scripts/build-pages.sh [output directory]      default: dist/pages
#
# The referee is compiled to WebAssembly (scripts/build-wasm.sh) and the client is
# built to run it in a Web Worker (VITE_BTS_LOCAL=1). Every URL in the result is
# relative, so the directory can be served from any path. To try it the way GitHub
# Pages serves it, under the repository name:
#
#   node apps/web/scripts/serve-static.mjs dist/pages 8080 /Before-the-stars/
#   node apps/web/scripts/pages-smoke.mjs http://127.0.0.1:8080/Before-the-stars/
#
# The ordinary client in apps/web/dist (the one the `bts` binary serves and embeds)
# is not touched. .github/workflows/pages.yml runs this script and publishes the result.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$ROOT/.toolchain/cargo/bin/cargo" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/env.sh"
fi
OUT="${1:-$ROOT/dist/pages}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac

"$ROOT/scripts/build-wasm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "node not found; run scripts/bootstrap.sh first" >&2
  exit 1
fi
echo "==> building the web client for the browser (no server)"
cd "$ROOT/apps/web"
if [ ! -d node_modules ]; then
  npm ci --no-fund --no-audit
fi
npx tsc --noEmit
VITE_BTS_LOCAL=1 npx vite build --outDir "$OUT" --emptyOutDir

# GitHub Pages: a not-found page that leads back to the game, and no Jekyll pass.
cp "$ROOT/apps/web/pages/404.html" "$OUT/404.html"
: > "$OUT/.nojekyll"

if ! ls "$OUT"/assets/*.wasm >/dev/null 2>&1; then
  echo "the build has no WebAssembly module in $OUT/assets" >&2
  exit 1
fi
echo "==> browser build complete: $OUT"
du -sh "$OUT" | sed 's/^/    /'
