#!/usr/bin/env bash
# Install every tool the project needs into .toolchain/ inside this repository.
# Nothing is written outside the repo. Re-running is safe.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TC="$ROOT/.toolchain"
NODE_VERSION="v22.11.0"
mkdir -p "$TC"
export RUSTUP_HOME="$TC/rustup" CARGO_HOME="$TC/cargo"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) NODE_PKG="node-$NODE_VERSION-darwin-arm64" ;;
  Darwin-x86_64) NODE_PKG="node-$NODE_VERSION-darwin-x64" ;;
  Linux-x86_64) NODE_PKG="node-$NODE_VERSION-linux-x64" ;;
  Linux-aarch64) NODE_PKG="node-$NODE_VERSION-linux-arm64" ;;
  *) echo "unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

if [ ! -x "$CARGO_HOME/bin/cargo" ]; then
  echo "==> installing Rust (stable, minimal profile) into .toolchain/"
  curl -sSf https://sh.rustup.rs -o "$TC/rustup-init.sh"
  sh "$TC/rustup-init.sh" -y --no-modify-path --profile minimal --default-toolchain stable
fi
if [ ! -x "$TC/node/bin/node" ]; then
  echo "==> installing Node.js $NODE_VERSION into .toolchain/"
  mkdir -p "$TC/node"
  curl -sSfL "https://nodejs.org/dist/$NODE_VERSION/$NODE_PKG.tar.gz" | tar -xz -C "$TC/node" --strip-components=1
fi
# shellcheck disable=SC1091
source "$ROOT/scripts/env.sh"
echo "==> installing web client packages"
(cd "$ROOT/apps/web" && npm install --no-fund --no-audit)
echo "==> toolchain ready: $(cargo -V), node $(node -v)"
