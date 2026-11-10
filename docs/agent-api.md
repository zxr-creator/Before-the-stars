# Agent API

Humans, native AI and external agents use one protocol. The browser client is simply
one consumer of the HTTP API below. The authoritative types are in
[`crates/bts-protocol/src/lib.rs`](../crates/bts-protocol/src/lib.rs); JSON field names
match the Rust field names and enums are `snake_case`.

Start the referee with `scripts/run.sh` (or `target/release/bts serve`). It listens on
`127.0.0.1:7878`. With `--require-tokens`, every request must carry the seat token
returned when the match was created; native-AI seats cannot be observed or driven
from outside.

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

A match with no `human` seat is an observer match. Nothing advances until asked:

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET /api/spectator` | | The whole world: every region, all four civilizations, armies and a merged event feed. Refused (403) when a human seat is playing or tokens are required |
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
