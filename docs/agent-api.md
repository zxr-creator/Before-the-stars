# Agent API

Humans, native AI and external agents use one protocol. The browser client is simply
one consumer of the HTTP API below. The authoritative types are in
[`crates/bts-protocol/src/lib.rs`](../crates/bts-protocol/src/lib.rs); JSON field names
match the Rust field names and enums are `snake_case`.

Start the referee with `scripts/run.sh` (or `target/release/bts serve`). It listens on
`127.0.0.1:7878`. With `--require-tokens`, every request must carry the seat token
returned when the match was created; native-AI seats cannot be observed or driven
from outside.

Every endpoint below is answered by one transport-neutral host (`crates/bts-host`),
which holds all the permission rules. The browser build runs the same host as
WebAssembly inside the page and has no HTTP API, so external agents always need this
server-backed referee ([web-build.md](web-build.md)).

## Integrated MCP decision exchange

Run `node tools/mcp.mjs` as a stdio MCP server (Node 22 or newer). Configure
`BTS_URL`, `BTS_SEAT` (0–3), and `BTS_SEAT_TOKEN` in the MCP server environment.
Credentials are never tool arguments. The adapter exposes only `get_turn` and
`submit_turn`; it cannot create matches, export saves, or read a spectator view.
Its newline-delimited JSON-RPC transport follows the
[official stdio specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

`get_turn` returns one complete permission-filtered observation, a cursor, receipts, public action templates,
communication/action limits and the seats the referee is waiting on. `submit_turn`
takes `{cursor, request_id, actions, advance}` and returns the same complete packet
after applying the batch. `advance` is `none`, `phase`, or `round`; the MCP default
is `phase`. Use `round` for a whole-round plan that intentionally passes remaining
negotiation. Negotiating adaptively still requires one exchange per window: future
replies cannot appear in an earlier round packet.

The HTTP equivalents are `GET /api/turn?seat=N&token=T` and `POST /api/turn` with
those fields plus `seat, token`. At most 32 actions are accepted in one batch.
Receipts remain per action: accepted actions stay applied when another fails,
and any rejection prevents automatic advance. `STALE_TURN` rejects a changed
observation before applying anything. An exact `request_id` retry returns its
original packet, while changing its payload returns `IDEMPOTENCY_CONFLICT`.
The latest 128 request results, bounded to 16 MiB of encoded payload, are cached in the running server; a single response exceeding that cap is not cached; reload/new-match
starts a new generation and process restart loses that cache. Read a fresh packet
after either event. Do not invent a new request ID merely because a response timed
out. Native/model-driven seats remain protected by the same authority checks.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET /api/match` | | Match summary: round, month, phase, window, seats, who is being waited on |
| `POST /api/match` | `{seed, regions, horizon, pace_bp, controllers, disclosed_objective, public_seed}` (all optional) | Creates a match and returns its summary with tokens for external seats |
| `GET /api/observation` | `?seat=N&token=T` | The seat's `Observation` |
| `POST /api/actions` | `{seat, token, actions:[Action…]}` (at most 32) | `{receipts:[Receipt…]}` |
| `POST /api/ready` | `{seat, token, through_round}` | Match summary after the referee has advanced as far as it can |
| `POST /api/delegate` | `{seat, token, domains}` | Hands the listed domains of an external seat to a steward; returns the match summary |
| `GET /api/saves`, `POST /api/save`, `POST /api/load` | `{name}` | Named saves under `saves/` |
| `GET /api/session/export` | | The whole session as save text (the format of the save files). Refused (403) when a seat is `external` or tokens are required: a save holds the entire world |
| `POST /api/session/import` | the save text as the body | Replaces the match and returns its summary with tokens. The save is checked and rehearsed first; a refused save (`400 INVALID_SAVE`) leaves the match in progress untouched |
| `GET /api/export/chronicle` | `?seat=N&format=md\|json` | The seat's own chronicle |

`controllers` is a list of four of `"human"`, `"external"`, `"easy"`, `"medium"`,
`"hard"`. `regions` is 24, 48 or 72. `horizon` is in months (2880 standard; 960 is the
short development fixture, for which `pace_bp: 3300` is suggested). With
`public_seed: false` the world root is mixed with server entropy and the seed label
alone no longer reconstructs the world.

Actions apply to the plan immediately and never advance time. A rejected action changes
nothing and consumes nothing; its receipt carries a `code` and a public `reason`.
Unknown and nonexistent references return the same error.

## The round

`phase` is `contact`, `negotiate` (with `window` 1–5), `plan` or `finished`.
`POST /api/ready` marks the seat done with the current phase; `through_round: true`
passes every remaining phase of the round. The referee advances when every seat is
ready, running native controllers itself. After the plan phase it resolves
`months_per_round` months and opens the next round.

| Action `kind` | When | Notes |
| --- | --- | --- |
| `select_contacts` | contact | Up to three known seats; a channel opens only if mutual |
| `message` | negotiate | Counted envelope: one per counterpart per window, ten per pair per round, 2,000 characters |
| `propose_treaty` | negotiate | Counted envelope carrying structured `clauses` |
| `sign_treaty` | negotiate (counted) or plan | Signs exactly the registered version |
| `decline_offer`, `withdraw_offer`, `break_treaty` | any | Protected operations; no envelope |
| `set_policy` | any | Food reserve, labour weights, mobilization share, enable a facility, rename, move capital |
| `start_project` | any | `build`, `research`, `survey`, `settle`, `study`, `resettle`, `recruit`, `religion`, `ftl_trial`, `ftl_deployment`, `ftl_replacement` |
| `manage_project` | any | `pause`, `resume`, `cancel`, and priority 0–9 (lower first) |
| `investigate` | any | Follow up a lead |
| `propose_reform` | any | Enact a recognized practice whose requirements are met |
| `start_program`, `manage_program` | any | Education programmes |
| `demolish`, `military_order`, `forfeit` | any | |

Clause kinds: `goods`, `knowledge`, `practice`, `maps`, `non_aggression`,
`defensive_pact`, `peace`, `subordination`, `cede_region`. A clause may reference only
technology or practice handles present in the proposer's own observation.

Example batch:

```json
{"seat": 0, "token": "", "actions": [
  {"kind": "start_project", "spec": {"kind": "build", "region": 12, "facility": "fields", "levels": 2}, "priority": 2},
  {"kind": "investigate", "lead": "k03fa91c"},
  {"kind": "start_program", "region": 12, "course": "E002", "seats": 8},
  {"kind": "set_policy", "setting": {"kind": "labor_weight", "category": "knowledge", "weight": 8}}
]}
```

## Observer matches

A match in which every seat is played inside the referee (built-in AIs and
model-driven seats) is an observer match: `observer_allowed` is true in the match
summary and nothing advances until asked. A `human` seat or an `external` seat that
speaks this API itself is a competitor, and a match with one is never an observer
match: every call in this table is refused (403) for it, and so is reading any seat
that the referee drives. The same holds whenever tokens are required.

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET /api/spectator` | | The whole world: every region, all four civilizations, armies and a merged event feed. Refused (403) when a human or external seat is playing or tokens are required |
| `POST /api/advance` | `{rounds}` (0–20; 0 pauses) | Match summary. All-native matches settle at once; with model seats the call returns immediately and the match advances as the models answer |
| `GET /api/agent-log` | `?seat=N` | What a model seat said it was doing each time it was consulted, with accepted and rejected orders and any error |
| `GET /api/observation` | `?seat=N` | Any seat's own view, read-only |

The spectator view is referee-level disclosure and is never available to a seat.

## Model-driven seats

A seat can be driven by a language model. In `POST /api/match`, use one of these
`controllers` values, with optional per-seat `agent_options`:

| Controller | How it runs | Credentials |
| --- | --- | --- |
| `claude-api` | Claude over the Messages API (default model `claude-opus-5-5`) | `ANTHROPIC_API_KEY` in the referee's environment, a profile from `ant auth login`, or `api_key` in `agent_options` |
| `claude-code` | The local `claude` command in print mode, with no tools, in an empty temporary directory | That CLI's own login (a Claude subscription) |
| `codex` | The local `codex exec` command, read-only sandbox, empty temporary directory | That CLI's own login |
| `openai-api` | Any OpenAI-compatible chat-completions endpoint | `OPENAI_API_KEY`, or `api_key`; `base_url` selects the endpoint; `model` is required |

```json
{"controllers": ["human", "claude-api", "codex", "hard"],
 "agent_options": {"1": {"model": "claude-opus-5-5", "consult_every": 5},
                   "2": {"model": "your-codex-model", "consult_every": 10}}}
```

`agent_options` fields: `model`, `consult_every` (ask the model every N rounds; default
1), `api_key`, `base_url`, `effort`. A key sent here is kept in memory only and is never
written to a save.

A model seat is an ordinary external seat. Each time it is consulted the referee renders
that seat's own observation as a compact text briefing and asks for one JSON object:
a short note, the domains to delegate to the steward, and up to 24 ordinary actions.
Invalid actions are rejected individually and reported in the agent log. The model sees
nothing but its seat's observation; the command-line tools are run without tools and
outside the repository. A steward runs every domain until the model says otherwise, so
a slow, failing or rarely consulted model never stalls its civilization: after three
consecutive failures the seat is marked `stopped` and the steward carries on alone.

Each seat in the match summary carries `agent: {provider, model, consult_every, state,
last_note, calls, last_error, thinking_seconds}` (`state` is `idle`, `thinking`, `error`
or `stopped`).

## Stewards

A human or external seat may delegate any of `economy`, `research`, `education`,
`culture`, `expansion` and `military` to a steward. A steward is the native Medium
policy restricted to those domains. It acts once per round at the end of the plan
phase, from that seat's own observation and through ordinary actions, so its receipts
appear with the seat's own. An empty `domains` list ends the delegation. Diplomacy is
never delegated.

## Reading an observation

- Goods, work, power and research are integer milli-units (1000 = one unit); shares are
  basis points; months are absolute simulation months.
- `regions` contains only regions the seat has seen. `own` is present for regions it
  controls; `foreign` gives population as a range; `visibility: "remembered"` means the
  data is as old as `last_seen`.
- `knowledge.techs` contains only discovered nodes and `knowledge.leads` only hinted
  ones. Handles are opaque and specific to the seat and match. `known_requirements`
  lists only requirements the seat knows of; `unknown_requirements: true` means more
  exist that it cannot yet name.
- `catalog` lists facility types, courses and formation tiers the seat knows about,
  with structured `site_key`, costs, jobs and recipes so that an agent can plan
  without parsing text.
- `objectives.victory` is absent until the seat has discovered the final objective
  (or the match was created with `disclosed_objective`).
- `briefing` holds events of the last resolved round plus standing conditions;
  `receipts` holds this round's action results; `chronicle` is the seat's history.

Estimates about others are deliberately coarse and are stable within a year:
re-querying never sharpens them. The observation contains no hidden state, and the
native opponents receive exactly this structure.

## Command line

```bash
target/release/bts match                         # summary
target/release/bts observe --seat 1 > obs.json
target/release/bts act --seat 1 --file actions.json     # a JSON array of actions
target/release/bts ready --seat 1 --round               # pass the rest of the round
```

Add `--url http://host:port` and `--token T` as needed.
