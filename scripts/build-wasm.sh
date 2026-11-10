#!/usr/bin/env bash
# Build the referee as a WebAssembly module for the browser build.
#
#   scripts/build-wasm.sh      writes apps/web/wasm/bts.wasm
#
# The module is crates/bts-wasm: the same host and rules as the HTTP referee, built
# for wasm32-unknown-unknown with the size-minded `wasm` profile of Cargo.toml. No
# bindings generator or other tool is involved. A web client built while the module
# is present carries it (see apps/web/vite.config.ts).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Use the repo-local toolchain when there is one; CI brings its own.
if [ -x "$ROOT/.toolchain/cargo/bin/cargo" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/env.sh"
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found; run scripts/bootstrap.sh first" >&2
  exit 1
fi
TARGET=wasm32-unknown-unknown
if command -v rustup >/dev/null 2>&1 && ! rustup target list --installed 2>/dev/null | grep -qx "$TARGET"; then
  echo "==> adding the $TARGET target"
  rustup target add "$TARGET"
fi

echo "==> building the WebAssembly referee"
cd "$ROOT"
cargo build --profile wasm --target "$TARGET" -p bts-wasm
BUILT="${CARGO_TARGET_DIR:-$ROOT/target}/$TARGET/wasm/bts_wasm.wasm"
mkdir -p "$ROOT/apps/web/wasm"
cp "$BUILT" "$ROOT/apps/web/wasm/bts.wasm"
echo "    apps/web/wasm/bts.wasm: $(wc -c < "$BUILT" | tr -d ' ') bytes, $(gzip -9 -c "$BUILT" | wc -c | tr -d ' ') gzipped"
