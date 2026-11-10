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
