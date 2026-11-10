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
Windows 10). Saves live in the per-user application-data directory. Nothing is
installed besides the game.

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
  The Intel half was built but not run.
- Windows: the x64 executable cross-compiles and links. It has not been run on
  Windows, and the release workflow (native build, icon, installer) has not been run.
