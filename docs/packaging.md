# Packaging and release

The game ships as one self-contained executable: the rules engine, the native
opponents, the model-seat adapters, the local referee and the whole client are in
the same file. Started without a command it opens the game in its own window.

## What a player gets

| Platform | Package | Contents |
| --- | --- | --- |
| macOS 11+ (Apple silicon and Intel) | `Before-the-Stars-<version>-macos.dmg` | `Before the Stars.app` (universal binary) and a README |
| Windows 10/11 x64 | `Before-the-Stars-<version>-windows-x64.zip` | `Before the Stars.exe` and a README |
| Windows 10/11 x64 | `Before-the-Stars-<version>-windows-x64-setup.exe` | Installer with Start-menu entry (built by the release workflow) |

The window is a native window showing the client through the operating system's
web view: WKWebView on macOS, WebView2 on Windows (part of Windows 11 and current
Windows 10). Saves live in the per-user application-data directory, and exported save
files in its `exports` folder (the window cannot download; see [saves.md](saves.md)).
Nothing is installed besides the game.

## Building packages

```bash
scripts/package.sh            # both
scripts/package.sh macos      # universal .app in a .dmg (must run on macOS)
scripts/package.sh windows    # x64 .exe in a .zip, cross-built with Zig
```

Output goes to `dist/release/`. The script uses only the repo-local toolchain and
installs Zig and `cargo-zigbuild` into `.toolchain/` on first use.

`.github/workflows/release.yml` builds the same packages on native macOS and
Windows runners, runs the tests, adds the Windows installer (Inno Setup) and the
executable icon, and attaches everything to a GitHub release when a `v*` tag is
pushed. It can also be started by hand from the Actions tab.

## Signing

Packages are not code-signed or notarized. That needs credentials only the publisher
has: an Apple Developer ID certificate plus notarization for macOS, and a code-signing
certificate for Windows. Until then:

- macOS: the first launch must be right-click → Open → Open.
- Windows: SmartScreen shows "Windows protected your PC" → More info → Run anyway.

To add signing later, sign the `.app` with `codesign --options runtime -s "Developer ID
Application: ..."` and notarize the `.dmg` with `xcrun notarytool`; on Windows sign the
`.exe` and the installer with `signtool`.

## Headless referee

`cargo build --release --no-default-features -p bts-server` builds the same binary
without the desktop window, for a server or CI machine. `bts serve` then serves the
client and API for browsers and external agents.

## What has and has not been verified

- macOS: the universal `.app` was built, launched, loaded the embedded client in its
  window and quit cleanly on this project's development machine (Apple silicon).
  The Intel half was built but not run. In a match the window loaded the 3D map
  module, so the system web view offered WebGL, but its frame rate there has not been
  measured (see the self-check below).
- Windows: the x64 executable cross-compiles and links. It has not been run on
  Windows, and the release workflow (native build, icon, installer) has not been run.

## Checking the 3D map on a machine

The automated checks draw the 3D map with a software renderer, so they say nothing
about a real graphics card. To measure one, run the game once in self-check mode with
the screen on and unlocked:

```bash
BTS_SELFCHECK=1 target/release/bts --port 7990 --saves "$(mktemp -d)"
# packaged macOS app: BTS_SELFCHECK=1 "/Applications/Before the Stars.app/Contents/MacOS/before-the-stars" --port 7990 --saves "$(mktemp -d)"
# Windows (PowerShell): $env:BTS_SELFCHECK=1; .\before-the-stars.exe --port 7990 --saves $env:TEMP\bts-check
```

It opens the window on a throwaway match, turns the camera for a few seconds close up
and over the whole world, prints one `selfcheck {...}` line with the graphics renderer
and frames per second, and quits. A software renderer manages about 13 frames per
second on a late-game map; a result near that on real hardware means the web view is
not using the graphics card. With the display asleep or locked no frames are presented
and the check reports that instead. The map's "Flat" switch is always available.
