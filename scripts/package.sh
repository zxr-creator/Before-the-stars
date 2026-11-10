#!/usr/bin/env bash
# Build release packages into dist/release/.
#
#   scripts/package.sh            macOS .dmg (universal) and Windows .zip (x64)
#   scripts/package.sh macos      only the macOS package
#   scripts/package.sh windows    only the Windows package
#
# The web client is embedded in the binary, so each package is self-contained and
# needs nothing installed. Uses only the repo-local toolchain (.toolchain/):
# Rust targets x86_64-apple-darwin and x86_64-pc-windows-gnu, plus Zig and
# cargo-zigbuild for the Windows cross-build (installed on first use).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/env.sh"
cd "$ROOT"

WHAT="${1:-all}"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
OUT="$ROOT/dist/release"
mkdir -p "$OUT"

echo "==> building web client"
"$ROOT/scripts/build.sh" --web-only

build_macos() {
  [ "$(uname -s)" = "Darwin" ] || { echo "the macOS package can only be built on macOS" >&2; return 1; }
  echo "==> macOS: building universal binary"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null
  cargo build --release --target aarch64-apple-darwin -p bts-server
  cargo build --release --target x86_64-apple-darwin -p bts-server
  local app="$OUT/macos/Before the Stars.app"
  rm -rf "$OUT/macos"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  lipo -create -output "$app/Contents/MacOS/before-the-stars" \
    target/aarch64-apple-darwin/release/bts target/x86_64-apple-darwin/release/bts
  sed "s/@VERSION@/$VERSION/g" packaging/macos/Info.plist > "$app/Contents/Info.plist"
  # icon: render the SVG once with the headless browser already in the toolchain, then scale
  local icon_png="$OUT/macos/icon-1024.png"
  (cd apps/web && node scripts/render-icon.mjs "$ROOT/packaging/icon.svg" "$icon_png")
  local set="$OUT/macos/AppIcon.iconset"
  mkdir -p "$set"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$icon_png" --out "$set/icon_${s}x${s}.png" >/dev/null
    sips -z "$((s * 2))" "$((s * 2))" "$icon_png" --out "$set/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$set" -o "$app/Contents/Resources/AppIcon.icns"
  rm -rf "$set" "$icon_png"
  # ad-hoc signature: required for the arm64 half to run at all; this is not notarization
  codesign --force --deep -s - "$app"
  cp packaging/README-macos.txt "$OUT/macos/README.txt"
  ln -s /Applications "$OUT/macos/Applications"
  local dmg="$OUT/Before-the-Stars-$VERSION-macos.dmg"
  rm -f "$dmg"
  hdiutil create -quiet -volname "Before the Stars" -srcfolder "$OUT/macos" -ov -format UDZO "$dmg"
  rm "$OUT/macos/Applications"
  echo "    $dmg"
}

build_windows() {
  echo "==> Windows: cross-building x64"
  if [ ! -x "$ROOT/.toolchain/zig/zig" ]; then
    echo "    installing Zig into .toolchain/ (linker for the cross-build)"
    mkdir -p "$ROOT/.toolchain/zig"
    case "$(uname -s)-$(uname -m)" in
      Darwin-arm64) z=zig-macos-aarch64-0.13.0 ;;
      Darwin-x86_64) z=zig-macos-x86_64-0.13.0 ;;
      Linux-x86_64) z=zig-linux-x86_64-0.13.0 ;;
      Linux-aarch64) z=zig-linux-aarch64-0.13.0 ;;
      *) echo "unsupported build host" >&2; return 1 ;;
    esac
    curl -sSfL "https://ziglang.org/download/0.13.0/$z.tar.xz" | tar -xJ -C "$ROOT/.toolchain/zig" --strip-components=1
  fi
  export PATH="$ROOT/.toolchain/zig:$PATH"
  command -v cargo-zigbuild >/dev/null || cargo install cargo-zigbuild --locked
  rustup target add x86_64-pc-windows-gnu >/dev/null
  cargo zigbuild --release --target x86_64-pc-windows-gnu -p bts-server
  rm -rf "$OUT/windows"
  mkdir -p "$OUT/windows"
  cp target/x86_64-pc-windows-gnu/release/bts.exe "$OUT/windows/Before the Stars.exe"
  cp packaging/README-windows.txt "$OUT/windows/README.txt"
  local zip="$OUT/Before-the-Stars-$VERSION-windows-x64.zip"
  rm -f "$zip"
  (cd "$OUT/windows" && zip -q -r "$zip" .)
  echo "    $zip"
}

case "$WHAT" in
  macos) build_macos ;;
  windows) build_windows ;;
  all) build_macos; build_windows ;;
  *) echo "usage: scripts/package.sh [macos|windows|all]" >&2; exit 2 ;;
esac
echo "==> packages are in dist/release/"
