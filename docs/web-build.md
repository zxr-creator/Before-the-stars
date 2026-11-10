# The browser build

The game can be published as a static site with no server behind it. The rules engine,
the built-in opponents and the referee are the same Rust code the desktop game runs,
compiled to WebAssembly and run in a Web Worker in the player's browser. This is the
build that GitHub Pages serves.

The server-backed game (`bts`, `scripts/run.sh`) is unchanged and is still the only way
to play with language-model seats or external agents.

## Build and try it

```bash
scripts/bootstrap.sh                 # once; adds the wasm32-unknown-unknown Rust target
scripts/build-pages.sh               # -> dist/pages (index.html, assets/, 404.html, .nojekyll)

# serve it the way GitHub Pages does, under the repository name, and check it
node apps/web/scripts/serve-static.mjs dist/pages 8080 /Before-the-stars/ &
node apps/web/scripts/pages-smoke.mjs http://127.0.0.1:8080/Before-the-stars/
```

`scripts/build-pages.sh` does two things: `scripts/build-wasm.sh` compiles
`crates/bts-wasm` for `wasm32-unknown-unknown` with the `wasm` profile of `Cargo.toml`
and copies the module to `apps/web/wasm/bts.wasm`; then the client is built with
`VITE_BTS_LOCAL=1` into the output directory. No bindings generator or other tool is
involved, and the ordinary client in `apps/web/dist` (the one `bts` serves and embeds)
is not touched. The module is built with source paths remapped, so it carries no path
of the machine that built it.

`pages-smoke.mjs` takes the site's address, so it can be pointed at the deployed site
as well. It plays a human match and watches an AI-only one in headless Chromium, and
fails on any page error, failed request, request to an `/api/` path, or request that
leaves the site's own path.

`node apps/web/scripts/wasm-bench.mjs` measures the module on its own in Node.

## Publishing

`.github/workflows/pages.yml` runs on every push to `main` (or by hand): Rust tests,
`scripts/build-pages.sh`, the browser check against the build served under
`/<repository>/`, then `actions/upload-pages-artifact` and `actions/deploy-pages`. It
needs Pages enabled for the repository with **GitHub Actions** as the source. Nothing
built is committed.

Every URL in the build is relative to the page or to the script that loads it (Vite
`base: './'`; the worker and the module are addressed through `import.meta.url`), so
the same files work at `https://<user>.github.io/<repository>/`, at a domain root, or
from any other directory. There is one page and no client-side routing; `404.html`
only links back to it.

## How it is put together

```text
crates/bts-host   the match host: session, request router, every permission rule
   ├── crates/bts-server   HTTP, files, window, language-model seats   (bts binary)
   └── crates/bts-wasm     the same host behind a C ABI                (bts.wasm)
apps/web/src/api.ts              one `api` object, two transports
apps/web/src/local/worker.ts     module Web Worker that owns the WebAssembly instance
apps/web/src/local/transport.ts  the page's side of the worker
```

The host answers requests shaped like the HTTP API of [agent-api.md](agent-api.md):
a method, a path with its query, a body. The server hands it what arrives over HTTP;
the worker hands it what the page sends by `postMessage`. The reply is the same text
either way, so the client does not know which referee it is talking to, and no
permission check exists in two places.

The transport is chosen once, when the page loads: a build made with `VITE_BTS_LOCAL=1`
always uses the worker; any other build that happens to carry the module (built after
`scripts/build-wasm.sh`, or with `scripts/build.sh --wasm`) uses it when the URL has
`?local`. `api.mode` is `'local'` or `'http'`.

### The module's interface

`bts.wasm` has no imports. Its exports (see `crates/bts-wasm/src/lib.rs`):

| Export | Meaning |
| --- | --- |
| `bts_abi()` | Interface version (1) |
| `bts_alloc(len)`, `bts_free(ptr, len)` | A buffer for the caller to fill |
| `bts_call(line, line_len, body, body_len, entropy_hi, entropy_lo)` | One request: `line` is `METHOD /path?query`, `body` the raw request body. Returns the status |
| `bts_result_ptr()`, `bts_result_len()`, `bts_result_flags()` | The reply body (raw bytes, valid until the next call) and its flags |
| `bts_tick()` | One step of observer playback; returns flags |
| `bts_panic_ptr()`, `bts_panic_len()` | The panic message after a failure |
| `bts_debug_panic()` | Fails on purpose, to test that a failure is reported |

Flags: 1 the match changed, 2 a round was resolved (the server's autosave point), 4 a
match was created or imported, 8 playback has steps due, 16 the reply is plain text,
32 a tick moved the match. Entropy for a new match comes from `crypto.getRandomValues`
in the worker; the module uses no clock, thread, file or operating-system randomness.

### The worker

Messages (`apps/web/src/local/protocol.ts`):

```text
page -> worker   { type: 'init', wasmUrl }
                 { type: 'call', id, method, target, body? }
worker -> page   { type: 'ready', abi }
                 { type: 'reply', id, status, body, flags }
                 { type: 'progress', flags }      a round resolved by playback, or playback stopped
                 { type: 'fatal', message }       the engine failed; the worker is finished
```

Calls are answered in order. `POST /api/advance` (step, play, run ten) does not block:
the host records how far to run and the worker resolves it one phase at a time,
returning to the event loop between steps, so the page can read the match as it moves
and a pause is heard within one step. A round that has been started is always finished,
so a paused match rests at the start of a round.

A panic aborts the module. The worker catches the trap, reads the message the panic
hook left, and tells the page, which shows it on the start screen; *Try again* starts a
fresh engine. Before a save is imported the worker rehearses it in a second, throwaway
instance of the module (the host builds every view and resolves one round), so a save
that would make the engine fail is refused and the match in progress is unharmed.

## Observer rules

The rule is in one place, `Host::observer_open` in `crates/bts-host`: the whole-world
view, any seat's own view, agent logs and playback control exist only when no seat is
human or external and seat tokens are not required. The browser build is held to it
like the server: someone playing in the page cannot fetch the spectator view of their
own match, another civilization's observation, or advance the match, through the page's
own `api` object or otherwise. `crates/bts-host/src/tests.rs` covers the rule and
`pages-smoke.mjs` checks it in the page.

A save, on the other hand, is the whole world. Whoever holds the save text holds
everything in it, exactly as with the server's save files on disk.

## Saves

Both transports offer:

| Client call | Request | |
| --- | --- | --- |
| `api.exportSession(): Promise<string>` | `GET /api/session/export` | The session as save text (the server's save-file format) |
| `api.importSession(text): Promise<MatchSummary>` | `POST /api/session/import` | Replaces the match; a refused save (`400 INVALID_SAVE`) leaves the match untouched |
| `api.onSessionChange(listener)` | | Browser build only: called after every request that changed the match and after every round playback resolves. `roundResolved` marks the server's autosave points |

In the browser build `api.saves() / save(name) / load(name)` work on session text kept
in the page's memory: a named save lasts until the page is closed or reloaded. Durable
storage (files, IndexedDB) is meant to be built on the three calls above.

## What the browser build does not have

- **Language-model seats and their logs.** They need a process that can hold a key or
  run a command-line tool. Setup does not offer them, and a request for one is refused
  by name. A save that contains such a seat cannot be imported.
- **External agents.** There is no HTTP API to connect to, so no `tools/mcp.mjs`, no
  `bts observe | act | ready`, and no seat tokens. Use the server-backed game.
- **Durable saves and autosave.** Reloading the page starts with no match (see above).
- **Quit.** There is nothing to shut down; the menu does not offer it.
- One match per page. Two tabs are two independent games.

It needs a browser with WebAssembly and module workers (current Chrome, Edge, Firefox
and Safari).

## Measurements

Taken on the development machine (Apple silicon), release 0.3.0 rules, with
`pages-smoke.mjs` in headless Chromium and `wasm-bench.mjs` in Node. A match of four
built-in AIs on 48 regions, standard length, played to its end:

| | |
| --- | --- |
| `bts.wasm` | 1,894,286 bytes; 497 KB with `gzip -9` (`opt-level = "s"`, LTO). `opt-level = 3` gives about 2.36 MB / 0.68 MB and is about a fifth faster |
| New match | 7 ms |
| One round, in the worker | about 4 ms in the first twenty rounds, 20 ms mid-match, 21–30 ms in the last twenty; slowest round 30–40 ms |
| Longest single step | 17 ms (the longest the worker is deaf to the page) |
| Whole 240-round match | 4.1–4.3 s |
| Interface thread while the worker plays | never held longer than 5 ms |
| Late-game replies | spectator view 0.66–0.70 MB in 4–7 ms; one seat's observation 1.0 MB in 5 ms; session export 1.3–1.4 MB in 6 ms |
| Late-game import | 28 ms in the module, checked and rehearsed; the worker does it twice (scratch instance, then the referee) |
| Engine memory at the end of the match | 10–12 MB of WebAssembly memory; the page's own JavaScript heap was 23 MB |

These vary by a few milliseconds from run to run and rise when the machine is busy.
The native engine resolves the same match in about 2.2 s.
