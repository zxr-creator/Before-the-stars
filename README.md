# Before the Stars

A competitive civilization strategy game for humans and AI agents. Four civilizations
grow from primitive, non-religious camps toward sustained faster-than-light capability
while managing the interdependence of food, labour, education, production, knowledge,
culture, diplomacy and war. One seat at most can win, and winning takes **both** real
governance of the whole inhabited world **and** a jump-capable service the winner can
build, crew, supply and replace.

This repository contains the v1.0 design documentation (`docs/`) and a playable
implementation of it: an authoritative Rust rules engine with native non-LLM opponents,
a local server, and a TypeScript browser client.

## Play

Requirements: macOS or Linux with `bash`, `curl` and `git`. Everything else is
installed **inside this repository** (`.toolchain/`), nothing globally.

```bash
scripts/bootstrap.sh     # once: Rust + Node.js into .toolchain/, web packages
scripts/run.sh           # builds if needed, then serves the game
```

Open <http://127.0.0.1:7878/>. Choose a seed, who controls each of the four seats
(human, or native AI on Easy / Medium / Hard), world size and length, then start.
The match autosaves each round to `saves/` and resumes when the server restarts
(`scripts/run.sh --fresh` ignores the autosave).

### A round

Each round is twelve simulated months for everybody. You read what changed, optionally
negotiate, plan, and end the round; the world then settles month by month.

1. **Contact** – privately pick up to three counterparts. A channel opens only where the
   choice is mutual.
2. **Negotiate** – five simultaneous windows; one envelope per counterpart per window and
   ten per pair per round. Messages are claims; only a signed structured treaty binds.
3. **Plan** – projects, programmes, policies, orders. Planning never advances time.
4. **Resolve** – twelve monthly steps of deliveries, labour, production, projects,
   teaching, food and water, births and deaths, conflict, discovery and culture.

"End round" passes every remaining phase. You are never required to negotiate.

### What you manage

- **Food and labour.** People eat first. Of the labour left over, custom lets you call up
  only a share for public projects; institutions raise that share. The rest staffs
  facilities in the order of your category weights. One person works one job.
- **Facilities and recipes.** Inputs are read from stock at the start of a month and
  outputs arrive the next month. Output is bounded by staff, qualified staff, inputs,
  power, upkeep and storage; every facility reports what is holding it back.
- **Education.** Twenty-four courses turn real learners into qualified people over real
  months, with teachers, places and materials. Students do not work. A first cohort can
  teach itself slowly when no instructor exists yet.
- **Knowledge.** The complete technology graph (138 nodes) is the same in every match;
  what you see is only what your people have discovered. Practice and contact produce
  leads; a small study turns a lead into a question; funded investigation with qualified
  staff turns it into understanding; building and operating turns it into capability.
- **Culture.** Sixty-four practices are recognized by people living with what they build
  on, enacted by reform once their real requirements exist, and then adopted gradually.
  Tendencies of each lineage drift slowly with how people actually live. A religion may
  emerge, or not; a secular path is fully viable.
- **Diplomacy.** Goods, teaching, maps, non-aggression, defensive pacts, peace,
  subordination and cession, as structured treaties with recorded performance.
- **War.** Three mutually countering roles per equipment tier; power is people × 2.5^tier
  × proficiency × supply × morale. No dice. Capture takes five months of control and
  sovereignty six more; occupied people do not become loyal workers.
- **The endgame.** Revealed only when your civilization discovers it (or from the start if
  you choose "disclosed objective" at setup): 96 continuous months as the highest real
  authority over every inhabited region with food, water and order holding everywhere; 24
  continuous months of fleet-wide jump capability; and two loaded round trips at least
  twelve months apart, flown during that governance. The winner scores `2 − T/H`;
  everyone else scores `−1`. Reaching the horizon with no winner is a valid outcome.

The chronicle records what your civilization actually experienced as an illustrated
timeline. Its cards grant nothing.

## Headless play, evaluation and agents

```bash
source scripts/env.sh
cargo build --release

target/release/bts run --seed riverland --ai hard,medium,medium,easy --every 20   # AI-only match
target/release/bts run --seed eval --matches 8 --rounds 240                        # 8 matches in parallel
target/release/bts verify --rounds 40      # determinism and checkpoint recovery
target/release/bts inspect --seat 1 --rounds 120   # one seat's own view, for tuning
cargo test --release                       # release-gate properties
```

External agents (Claude Code, Codex, scripts) play through the same HTTP API as the
browser, or through the `bts observe | act | ready` commands. They receive only their
seat's observation. See [docs/agent-api.md](docs/agent-api.md).

## Repository layout

```text
crates/bts-protocol   Seat-facing contracts: Observation, Action, Receipt (serde)
crates/bts-engine     Authoritative rules: content, world generation, monthly simulation,
                      actions, observation projection, victory, tests
crates/bts-ai         Native Easy/Medium/Hard opponents; depends only on bts-protocol
crates/bts-server     `bts` binary: HTTP referee, web host, headless runner, agent CLI
apps/web              TypeScript + Preact client: atlas map, panels, chronicle
content/              Technology, practice and course graphs extracted from the design atlases
scripts/              bootstrap, build, run, content extraction
docs/                 v1.0 design documentation, agent API, implementation status
dist/                 The original design archive and its checksum
```

The engine is integer-only and deterministic: the same seed and the same actions give
the same state hash, and a restored checkpoint continues identically. The native AI is a
separate crate that cannot see the engine's state; it is called with its seat's
observation exactly as an external agent would be.

## Implementation status

This is a complete playable loop built to the v1.0 design, with deliberate
simplifications. [docs/implementation-status.md](docs/implementation-status.md) lists,
chapter by chapter, what is implemented, what is abstracted and what is not yet built.
In short:

- Implemented: seeded causal geography; aggregate population with 81 annual age cells,
  nine-month birth lag and one combined mortality calculation; labour, power, recipes,
  upkeep and storage; all 138 technologies, 64 practices and 24 courses with dynamic
  discovery; religion founding; structured treaties with the contact / window / envelope
  limits; three-role warfare, occupation and elimination; G96 ∧ F24 ∧ Trials96 with
  terminal reward; seat-filtered observations with opaque handles; three native AI
  difficulties without information or resource bonuses; saves, replay hashes, HTTP and
  CLI agent access; a flat illustrated atlas client with a Historic Moments chronicle.
- Abstracted: goods are pooled nationally with a per-region carriage loss instead of
  per-shipment logistics; the 34 recipes are represented by about sixty facility types;
  private actors, prices and money are folded into labour, goods and callable-labour
  limits; factions are reported but act through stability rather than as separate
  ledgers; there is one access class per region.
- Not built: the 3D atlas tier (the flat atlas tier is complete), a Mac shell, MCP
  adapter, multi-match server rooms, generated SDKs, and post-match counterfactual replay.

Numbers are provisional calibration, as the design states. In all-AI matches the native
opponents typically complete the full technology and practice graphs between year 160
and year 200 and then contest the world; none has yet completed global integration
inside the horizon, which the design treats as a legitimate unresolved outcome.

## Design documentation

Start with [docs/README.md](docs/README.md) and
[the complete v1.0 plan](docs/design/30-complete-plan-v1.0.md). The design documents are
designer material: they describe hidden mechanisms and the eventual objective. Runtime
isolation hides match state from seats; it does not make a published design unknowable.
