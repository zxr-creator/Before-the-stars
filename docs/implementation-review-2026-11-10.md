# Implementation review and Fable handoff — 2026-11-10

Reviewed repository: `zxr-creator/Before-the-stars`, main at the time of checkout.
The revision branch is `codex/observer-provinces-turn-mcp`. This review distinguishes
implemented fixes from the next requested work; publishing is not claimed.

## Findings and fixes in this revision

- Observer functionality existed but was implicit: only a match without a human
  seat became an observer match. Added a title-screen entry and explicit setup
  choices. Verified world view, stepping and a read-only civilization view.
- The economy already constructed and expanded facilities with real materials and
  labour. Added a regional building browser with build/expand cards, exact queued
  levels, authoritative site caps, costs, operating bottlenecks and a queue.
- Existing 24/48/72 Voronoi regions remain the construction units. A Construction
  map lens colors development and offers a selected-region planning summary in
  both map tiers. The flat atlas is the default for new browser preferences; 3D
  remains available. This is a functional starting point, not a completed Victoria 3
  visual reproduction. The user's latest visual reference is Victoria 3 alone.
- Industrial/extractive buildings can share general support posts when maintained
  and enabled, up to 20%. Skilled posts, materials, energy, capacity and upkeep
  retain their real requirements. There is no extra mass from a throughput bonus.
- Fixed pending-level accounting in the original build form and a first-prototype
  cancellation loophole: before a type exists, parallel orders all pay prototype
  work. The quote now includes this real work requirement.
- There was no MCP adapter. Added a stdio adapter with `get_turn` / `submit_turn`
  and the Rust `/api/turn` endpoint. Both observation and results are integrated
  packets; batches enforce ordinary seat permissions. Retry IDs, stale cursors,
  per-action receipts, rejection handling and bounded retry caching are explicit.
  Negotiation remains causal: a later reply requires a later window exchange.

## Additional requested work for Fable

1. Complete the Victoria 3 map direction: large state-like regions, readable
   political fills, restrained terrain, clear borders and capitals, rural/resource
   sites and city/industrial clusters. Buildings belong to these regions. Avoid
   tiny hexes, decorative clutter and building-by-building map micromanagement.
2. Calibrate demographic and productive units together. Current launch-complex,
   orbital-station and orbital-yard definitions in `content.rs` have small direct
   crews and relatively small generic work/input costs; the surrounding industrial
   support is not calibrated to a real national space programme. Early seats start
   with only a few hundred people. Do not solve this by changing HUD numbers or
   imposing a population threshold. Declare physical units and calibrate the
   population, teachers, industrial workforce, electricity, material quantities,
   precision manufacturing, logistics and sustained programme costs together.
   Small countries may participate through costly real imports, hired expertise
   and shared infrastructure; a few million isolated people should not support an
   entire advanced industrial and space stack without those dependencies. Reconcile
   population growth, education time and the campaign horizon before freezing
   values. Do not claim FTL is established physics.
3. Add complete portable saves. Current `/api/save` and `/api/load` are server-side
   named files, not browser file export/import or bounded browser persistence.
   Use the same versioned format for desktop/server and browser play. Preserve
   world state, clock, RNG streams, orders, contracts, AI memory and chronicles;
   never API keys. Validate schema, references, content/rules versions, decoded
   size, integrity and migration compatibility before replacing the live match.
   A failed import must preserve the current game. Server `Session::load` currently
   lacks comprehensive semantic validation, so a file picker alone is insufficient.
4. Use IndexedDB for compressed browser autosaves; localStorage is only for small
   preferences/index metadata. Start with a configurable 20 MiB total budget and
   three rotating autosaves. Track stored bytes; evict old autosaves first, retain
   manual saves, and offer export/clear controls plus visible quota/error recovery.
   Enforce a bounded decoded import size as well as compressed file size. Desktop
   file saves remain available. Refresh and cross-device file round trips must
   reproduce the saved state and subsequent deterministic results.
5. Publish a genuinely playable GitHub Pages build. Pages is static hosting, so
   `vite build` alone cannot run the current Rust HTTP referee. Reuse the Rust engine
   in WebAssembly inside a Web Worker for local browser play; keep the native/server
   referee for authenticated external MCP and competitive evaluation. Use a single
   rules implementation and test native/WASM parity. Browser users can inspect local
   state; a browser-only game is not a trusted hidden-state competition host. LLM
   keys and private evaluator state must not be bundled in the static build.
6. Add a Pages Actions workflow with the repository base path, relative assets/WASM,
   artifact/deployment permissions and refresh support. Verify actual play, AI-only
   observation, construction, saving and reloading at the deployed URL. Keep the
   repository private unless the owner explicitly requests a visibility change.
   If this account cannot publish Pages from a private repository, report the
   exact hosting restriction; do not silently change access.

## Acceptance evidence

The Rust tests cover resource/population conservation, information filtering,
replay/checkpoint behavior, victory, diplomacy, queued construction and prototype
costs, scale without free goods, turn permissions, retry safety, stale packets,
partial rejection and round completion. The MCP adapter has a local HTTP
integration test. The TypeScript client typechecks and builds. Browser review
confirmed the observer entry, setup, one-round playback, read-only building cards
and the selected-region construction map. These checks do not establish whole-game
balance, realistic space-programme scale or a working Pages deployment.

Run:

```sh
source scripts/env.sh
cargo test --workspace --no-default-features
node --test tools/mcp.test.mjs
npm --prefix apps/web run build
```

References: [Victoria 3 industry overview](https://www.paradoxinteractive.com/games/victoria-3/news/dev-diary-57-the-journey-so-far),
[GitHub Pages hosting model](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages),
[MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
