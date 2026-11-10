# Saves

A save is one file, `<name>.btsave`, and it is the same file everywhere: the desktop
game, the server-backed game in a browser, and the browser build that runs with no
server all write and read it with the same Rust code (`crates/bts-host/src/portable.rs`,
compiled into the `bts` binary and into `bts.wasm`). A game exported from the browser
loads on the desktop and the reverse, and the two then play on identically.

This page covers the file format, what is checked before a file is loaded, where
saves are kept in each build, the browser's storage budget and autosave, and what a
save does and does not contain.

## The file

All integers are little-endian.

| Offset | Size | Field | |
| --- | --- | --- | --- |
| 0 | 8 | magic | `89 42 54 53 41 56 45 0A` (`"\x89BTSAVE\n"`) |
| 8 | 2 | format version | 1. This build reads and writes only 1 |
| 10 | 2 | flags | reserved; must be 0 |
| 12 | 4 | header length *H* | 1 to 65,536 |
| 16 | 4 | header CRC-32 | IEEE CRC-32 of the *H* header bytes |
| 20 | *H* | header | a UTF-8 JSON object |
| 20+*H* | *S* | payload | a raw DEFLATE stream of the session save text; *S* is `stored` in the header and runs to the end of the file |

The first byte is not ASCII and the magic ends in a line feed, so a transfer that
treated the file as text is caught at the first field. Nothing follows the payload.

The header is plain, so a file can be described without unpacking it:

```json
{
  "kind": "manual",
  "name": "before-the-flood",
  "created_ms": 1794340482417,
  "game": "0.3.0",
  "versions": {
    "ruleset": "bts-rules/1.0.1", "content": "bts-content/1.0.0", "generator": "bts-worldgen/1.0.0",
    "protocol": "bts-protocol/1.1", "policy": "bts-native/1.0.0", "session": "bts-save/1"
  },
  "match_id": "bts-3d523a70",
  "seed": "riverland",
  "regions": 24, "round": 3, "month": 24, "year": 3, "horizon": 2880, "finished": false, "winner": null,
  "seats": [{ "seat": 0, "name": "Riverland", "controller": "human", "status": "active" }, "…"],
  "codec": "deflate",
  "length": 165307,
  "stored": 10658,
  "stored_crc32": 1392004365,
  "sha256": "12fffed2af633a1a9d8978d37681ce49fe793e232b30c833ebe3f567455ea25a"
}
```

- `kind` is `manual` (the player asked for it) or `auto` (the game made it).
- `created_ms` is supplied by whoever asked for the file (the host has no clock): the
  server's clock, or the page's.
- `versions` are read from the engine's constants when the file is written.
- `seed` is present only when the match discloses its seed. A sealed seed is in the
  payload, as it is in any save, but not in the plain header.
- `seats[].agent` names the provider of a language-model seat. No credential is ever
  written (see [What a save contains](#what-a-save-contains)).
- `length` is the size of the session text once unpacked, `stored` the size of the
  payload in the file, `stored_crc32` the CRC-32 of the payload as stored, and `sha256`
  the SHA-256 of the unpacked text.
- A reader ignores header fields it does not know, so a later build can add some
  without a new format version.

The payload is the session save text of `Session::save` (`bts-save/1`: the world, the
built-in controllers' memory, stewards, seat tokens, and the configuration of
language-model seats without credentials). The container treats it as opaque.

### Why these pieces

- **DEFLATE** through `miniz_oxide`, and **SHA-256** through `sha2`: both are pure Rust
  with no system dependencies, so they compile for `wasm32-unknown-unknown` unchanged,
  and both were already in the dependency tree of the server. Compression is done by
  the referee, in Rust, in both builds. The page never compresses anything, so it does
  not need `CompressionStream` (checked in `pages-smoke.mjs` with it removed).
- **Level 6.** Measured natively on a four-AI, 48-region match (`cargo test --release
  -p bts-host -- --ignored --nocapture measure`):

  | Round | Session text | Level 1 | Level 3 | Level 6 | Level 9 |
  | --- | --- | --- | --- | --- | --- |
  | 4 | 228,862 | 32,518 in 1.8 ms | 24,596 in 2.1 ms | 23,074 in 3.0 ms | 22,809 in 5.2 ms |
  | 61 | 555,533 | 106,351 in 2.1 ms | 76,089 in 2.8 ms | 70,773 in 5.1 ms | 69,852 in 8.2 ms |
  | 121 | 1,005,437 | 199,488 in 3.8 ms | 140,322 in 4.9 ms | 130,373 in 9.3 ms | 128,319 in 15.5 ms |
  | 240 | 1,330,990 | 263,564 in 5.1 ms | 184,039 in 6.7 ms | 170,561 in 12.8 ms | 167,876 in 24.7 ms |

  Level 6 is within 2% of the smallest for half the time of level 9. Checking and
  unpacking a late-game file takes 3.7 ms natively.
- **Two kinds of checksum.** The header and the packed payload each carry a CRC-32, so
  accidental damage anywhere in the file is caught before any work is done (a DEFLATE
  stream ends in padding bits that unpacking alone ignores). The unpacked text carries
  a SHA-256, which is also the save's identity: two files with the same hash hold the
  same game, and the browser's autosave uses that to skip a save it already has.
  Neither is a signature. A save file is not authenticated; a file edited on purpose
  with its checksums recomputed is caught by the rehearsal below, or not at all.

## What is checked before a file is loaded

`portable::open`, then the host (`Host::install_file`), in this order. The first
failure stops the import with a specific reason, and **the match in progress is left
exactly as it was**: nothing is replaced until the last step has passed.

| Step | Refusal (`reason`) |
| --- | --- |
| The file is no larger than the reader accepts (64 MiB unless configured) | `TOO_LARGE` |
| The magic is right | `NOT_A_SAVE` |
| The preamble is complete | `TRUNCATED` |
| The format version is 1 and no unknown flag is set | `FORMAT_VERSION` |
| The header length is 1 to 65,536 and the header is all there | `BAD_HEADER`, `TRUNCATED` |
| The header matches its CRC-32 | `CORRUPT` |
| The header is JSON of the right shape, with a known codec and a usable checksum | `BAD_HEADER`, `FORMAT_VERSION` |
| The file holds exactly `stored` bytes of payload: no fewer, no more | `TRUNCATED`, `CORRUPT` |
| The ruleset, content and session-format versions are the ones this build runs | `INCOMPATIBLE` ("this file was saved by rules X; this build runs rules Y") |
| The declared unpacked `length` is within the limit (64 MiB unless configured), checked **before anything is inflated** | `TOO_LARGE` |
| `length` is not more than DEFLATE could produce from `stored` bytes | `CORRUPT` |
| The payload matches its CRC-32 | `CORRUPT` |
| Inflation, which **stops at `length`** however much the stream holds, so a deflate bomb cannot grow past what the header admits to | `CORRUPT` |
| The result is exactly `length` bytes and matches the SHA-256 | `CORRUPT` |
| The text parses as a session, and every seat can be run by this referee | `UNPLAYABLE`, `NEEDS_SERVER` |
| **Rehearsal**: on a scratch copy, every seat's view is built and a whole round is resolved | `UNPLAYABLE` |

The generator, protocol and AI-policy versions are recorded and shown, but do not
block a load: the world in a save is already generated, and the built-in controllers
carry their own state.

The limits are `Host::limits` (`portable::Limits { max_file, max_unpacked }`); the
server sets both with `bts serve --save-max-mb N`.

In the browser build a panic aborts the WebAssembly module, so the worker runs the
whole import in a second, throwaway instance of the module first. A file that makes
the engine fail takes down only that instance. "What is this file?" (the import
preview) is answered entirely in such an instance and never touches the one that holds
the match.

Bare session text (a save from before the container existed, and the server's
`autosave.json`) is still accepted wherever a save file is: it is held to the same size
limit, parsed and rehearsed in the same way, and described as "older format".

The refusals are tested by comparing the match before and after:

- `crates/bts-host/src/portable.rs`: every truncation point, a flipped bit at every
  byte of the preamble and header and across the payload, foreign files, a future
  format, other rules, header rules, the size caps, and a 48 MiB deflate bomb.
- `crates/bts-host/src/tests.rs`,
  `every_refused_save_file_leaves_the_match_exactly_as_it_was`: seventeen bad files
  through the import and describe routes, each checked for its reason and for an
  unchanged state hash, match id, round, generation and session text.
- `apps/web/scripts/pages-smoke.mjs` and `saves-smoke.mjs`: eleven bad files through
  the interface and the HTTP API, in the browser build and against the server.

## Routes

The save-file routes are in the shared host, so the HTTP server and the browser build
answer them identically. Bodies and replies are bytes.

| Request | |
| --- | --- |
| `GET /api/savefile?kind=manual\|auto&name=…&created=<ms>` | The running match as a save file (`application/x-bts-save`). Refused (403) when a seat is `external` or tokens are required |
| `POST /api/savefile/describe` (body: the file) | What the file is and whether it would load: `{loadable, reason, message, legacy, bytes, header, file_name, game, build}`. The header is given even for a file that cannot be loaded, when it could be read. Loads nothing. `?rehearse=0` skips the rehearsal |
| `POST /api/savefile/import` (body: the file) | Replaces the match and returns its summary, or `400 {"error":"INVALID_SAVE","reason":"…","message":"…"}` with the match untouched |
| `POST /api/savefile/rename?name=…` (body: the file) | The same file with another name in its header (the payload is not unpacked) |
| `GET /api/session/export`, `POST /api/session/import` | The session as bare text, as before |

The client calls them through `api.exportSave()`, `api.describeSave(bytes)`,
`api.importSave(bytes)` (`apps/web/src/api.ts`).

The server adds what needs a disk (`crates/bts-server/src/saves.rs`):

| Request | |
| --- | --- |
| `GET /api/saves` | `{saves: [names], entries: [{name, kind, legacy, bytes, modified_ms, header}], total_bytes, dir, exports_dir}` |
| `POST /api/save {name}` | Writes `<name>.btsave` in the saves folder |
| `POST /api/load {name}` | Loads it (or an older `<name>.json`), with every check above |
| `POST /api/saves/rename {name, to}`, `POST /api/saves/delete {name}` | 409 when the new name is taken |
| `GET /api/saves/file?name=…` | A named save as a download |
| `GET /api/exports` | The save files in the exports folder, with what each says it is |
| `POST /api/exports/write {name?}` | Writes the running match, or a named save, into the exports folder; returns `{file, path, dir, bytes}` |
| `POST /api/exports/describe {file}`, `POST /api/exports/import {file}` | As the save-file routes, for a file in the folder |
| `POST /api/exports/reveal {file?}` | Shows the file, or the folder, in the system's file manager |

## What a save contains

**Never an API key.** A language-model seat's key is held in memory only
(`AgentConfig::api_key` is never serialized). Its address is written without user
information, query or fragment (`scrub_url`: `https://user:key@host/v1?key=…` becomes
`https://host/v1`), and any other field of the seat's configuration that repeats the
key is blanked (`AgentConfig::for_save`). The export routes additionally refuse to
answer if the text they are about to hand out contains a key the session holds
(`Session::leaks_credential`). `a_save_never_contains_an_api_key` in
`crates/bts-host/src/tests.rs` configures two seats with keys in every field that
takes text and searches the session text, the export, the container (packed and
unpacked) and its header for the keys and for fragments of them. A loaded match
therefore resumes a language-model seat with the provider and model it had, and the
key must come from the environment again. The browser build has no such seats and
stores no keys anywhere.

**Seat tokens are in a save, and stay there.** A save is the whole world: every
civilization's private state, and the token of each seat. That is why the export
routes are refused (403) on a referee that has an `external` seat or was started with
`--require-tokens`, for the running match and for any stored save of such a match
(`Host::export_file`, `Host::export_text`): on such a referee a token is what keeps one
competitor out of another's seat, and a save would hand over both the tokens and
everything they protect. A match that *can* be exported has no secret among its seats
(they are played by the people at that machine and by built-in AIs), and its tokens
guard nothing. Keeping them makes a file byte-identical to the session it came from,
which is what lets the tests compare state by comparing bytes. Tokens are not
credentials for anything outside the match.

A referee may always keep its own saves (the autosave, a named save) whatever the
seats: those stay on its disk.

## Where saves are kept

### Desktop and server

```text
<saves>/autosave.json       the autosave: session text, rewritten at every round and on quit
<saves>/<name>.btsave       a named save
<saves>/<name>.json         a named save from before the container: still listed and loaded
<saves>/exports/*.btsave    files the player exported, or put there to import
```

`<saves>` is `saves/` beside the referee, `--saves <dir>`, or for the packaged game the
per-user application-data folder (`~/Library/Application Support/Before the Stars/saves`
on macOS). `--exports <dir>` moves the exports folder. Named saves are written whole
(to a temporary file, then renamed). A `.btsave` shadows a `.json` of the same name.

**Getting a file out of the desktop window.** The packaged game shows the client in the
system web view (WKWebView on macOS, through `wry` 0.47). Checked there on macOS:

- **Downloads do not work.** With no download handler installed, `wry` answers every
  download with "cancel" (`wkwebview/navigation.rs`). Run in the real window, a click
  on a blob `<a download>` and on a link to `/api/savefile` did nothing: the page
  stayed, and the referee never received the request for the link.
- **`<input type="file">` is implemented** by `wry` with a native open panel
  (`run_file_upload_panel`), and file drops fall through to the web view. This is from
  reading `wry`'s source; the panel needs a real click and was not opened by a test.

So in the desktop window *Export* asks the referee to write the file into the exports
folder and shows where it is, with *Show in folder* (`open -R` on macOS, `explorer
/select` on Windows). Import works through the file picker, by dropping a file on the
window, or by putting the file in the exports folder and choosing it from the list
there, which depends on nothing in the web view. In an ordinary browser talking to the
server, *Export* is a normal download.

### The browser build

Saves are kept in IndexedDB (database `bts-saves`): each save is a `.btsave` file,
already compressed by the referee, stored whole, with a small record of facts beside
it for listing (`apps/web/src/saves/vault.ts`).

**The budget.** The vault holds at most 20 MiB, counted over what it stores (files and
their records). The player can change it in *Saves and storage*; a build can change
the default with `VITE_BTS_SAVE_BUDGET_MIB`. A late-game save is about 170 KB, so the
default budget holds over a hundred of them.

**Autosave** (`apps/web/src/saves/autosave.ts`). After every resolved round, and when a
match is created or loaded, the worker exports the match as a save file and the page
stores it. Three are kept (configurable there too, and with `VITE_BTS_AUTOSAVES`; 0
turns autosave off). Orders given within a round are saved once the player has paused
for a second and a half, and at once when the tab is hidden or closed, as far as the
browser lets an asynchronous write finish; they replace the autosave of the same round
instead of using another slot. Only one write is ever in progress. Changes that arrive
meanwhile are coalesced into one more write of the state as it then stands, and while
observer playback runs autosaves are started at most every two seconds, so a
fast-forward does not write every round. The export happens in the worker and the
write is an asynchronous transaction: the interface thread is not blocked.

**Making room.** Every change is one read-write transaction that reads what is stored,
decides, and applies all or nothing:

- Writing an autosave keeps it and the newest *N* − 1 before it.
- If the budget is still exceeded, the **oldest autosaves are removed first**, and only
  autosaves.
- **A manual save is never removed automatically.** If one does not fit even with every
  autosave gone, it is refused, nothing is removed, the reason is shown, and *Saves and
  storage* opens so the player can decide what to delete.
- An autosave that does not fit even alone is skipped and nothing is removed (older
  autosaves are worth more than none). A warning stays on screen, "autosave is off
  until space is freed", until an autosave succeeds or the player dismisses it.
- If the browser itself refuses a write the budget allowed (`QuotaExceededError`), the
  vault takes what is stored now as the real ceiling and plans again within it: an
  autosave gets through by giving up older autosaves; a manual save is refused.

**After a reload.** The referee in the page starts with no match, so the page restores
the latest autosave: the match this tab was playing if it still has one, otherwise the
newest of all. A reloaded tab returns straight to the game; a fresh visit opens on the
title screen with *Continue* ready, saying which autosave it is and when it was made.
An autosave that will not load is passed over for the one before it, and the player is
told; it is kept, listed in *Saves and storage*, and not tried again in that tab. If
none loads, the page rests on the title screen and says so. The same happens after an
engine failure: *Try again* starts a fresh engine and gives it the autosave.

**When storage is not what it should be.**

| Situation | What happens |
| --- | --- |
| IndexedDB is blocked or missing (a private window, site data disabled) | The same rules run over a table in memory. `api.features.durableSaves` is false, the menu and *Saves and storage* say that saves last until the tab closes, and autosave is reported off |
| The game is open in another tab | Each tab warns. All tabs share the saves and the three autosave slots; because every change is one transaction, concurrent writes cannot corrupt a save or evict twice for the same space. After a reload a tab prefers the autosave of its own match |
| Another tab running a newer version upgrades the database | This tab closes its connection at once, stops storing, and asks for a reload |
| The database was written by a newer version | It is left untouched; saves made now last until the tab closes; the page says to reload |
| The database needs upgrading from an older layout | `upgrade()` in `vault.ts` runs the steps from the stored version to the current one (version 1 is the first) |
| `CompressionStream` is missing | Nothing changes: compression is the referee's, in Rust |

**Persistent storage.** Browsers may clear a site's data when the device runs short of
space unless the site has been granted persistence. The page asks
(`navigator.storage.persist()`) once the player has made a save of their own, which is
the moment there is something worth keeping, and *Saves and storage* shows whether it
was granted, with a button to ask again. Browsers decide by their own rules (Chrome by
how the site is used, Firefox by asking the person).

## Saves and storage

One dialog, opened from *Load game* on the title screen and from the game menu
(`apps/web/src/saves/manager.tsx`):

- how much is used against the budget, split into the player's saves and autosaves,
  and the browser's own estimate for the site when it gives one (browser build), or
  the saves folder and its total size (server);
- every manual save and autosave with its match, year, round, size and date, and
  *Load*, *Export*, *Rename* and *Delete* (a manual save is deleted only after a second
  confirmation);
- *Delete all autosaves*, the budget and the autosave count (browser build);
- *Export to a file* for the game in progress;
- *Import a save file* by picker or by dropping a file anywhere on the window. The
  referee describes the file first, and the preview shows the match, year, seats,
  versions (the file's beside this game's), sizes, and whether it can be loaded and why
  not. Only a file that can be loaded offers *Replace the current game*.

## Measurements

Apple silicon, release build, rules 0.3.0. Browser figures are from `pages-smoke.mjs` in
headless Chromium, with the referee as WebAssembly in a worker.

| | |
| --- | --- |
| Save file, 24 regions, round 3 | 11.5 KB for 165 KB of session text (14:1) |
| Save file, 24 regions, round 7 | 24.5 KB for 210 KB (8.5:1) |
| Save file, 48 regions, round 4 | 23 KB for 229 KB |
| Save file, 48 regions, end of a 240-round match | 168–171 KB for 1.33 MB (7.8–8.2:1) |
| Three late-game autosaves | about 0.5 MB of the 20 MiB budget |
| Making a late-game file natively (level 6) | 12.8 ms; checking and unpacking it 3.7 ms |
| Making a late-game file in the browser (worker, including the trip to the page) | 25 ms |
| Describing a late-game file in the browser (verified and rehearsed, in a scratch instance) | 26 ms |
| Importing a late-game file in the browser (rehearsed in a scratch instance, then installed) | 52 ms |
| Autosave early in a match | export 3–5 ms in the worker, IndexedDB write about 1 ms |
| Autosave during a whole observed match | 13 written for 240 rounds; slowest export 32 ms, slowest IndexedDB write 2 ms; the interface thread was never held longer than 5 ms |
| Twelve rounds resolved back to back | 1 autosave write |
| `bts.wasm` with the container | 2,011,806 bytes, 538,542 with `gzip -9` (117 KB and 41 KB more than before) |

## Checks

```bash
cargo test --release                                   # the container, every refusal, both transports
scripts/build-pages.sh
node apps/web/scripts/serve-static.mjs dist/pages 8794 /Before-the-stars/ &
node apps/web/scripts/pages-smoke.mjs http://127.0.0.1:8794/Before-the-stars/

BTS_NO_WINDOW=1 BTS_NO_BROWSER=1 target/release/bts serve --port 7984 --fresh --saves <dir> &
BTS_URL=http://127.0.0.1:7984 PAGES_URL=http://127.0.0.1:8794/Before-the-stars/ \
  node apps/web/scripts/saves-smoke.mjs                # the server, its interface, and both ways between the builds
```

`pages-smoke.mjs` removes the saves it makes and does not assume an empty database, so
it can be pointed at the deployed site. `apps/web/scripts/savefile-lib.mjs` reads and
damages save files in Node, independently of the game's own code.
