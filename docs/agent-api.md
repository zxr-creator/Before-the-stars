# Agent API

> **Current implementation reference (audited 2026-11-13, protocol 2.6).**
> This page documents shipped endpoints. The simpler next-design experience is in
> [chapter 43](design/43-agent-access-and-decision-packets.md); its proposed commands
> are not available yet. [Chapter 44](design/44-institutional-education.md) will replace
> routine course actions, and [chapter 15](design/15-victory-and-ftl.md) changes victory.
> Neither change is implemented by this documentation update.

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

The game's MCP server is built into the game binary: `bts mcp` speaks newline-delimited
JSON-RPC on stdio (the
[stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)),
bound to one seat by its environment: `BTS_URL` (the referee, for example
`http://127.0.0.1:7878`), `BTS_SEAT` (0–9) and `BTS_SEAT_TOKEN`. `BTS_MAX_CALLS`
(optional) caps the tool calls of one run. `node tools/mcp.mjs` (Node 22 or newer) is the
same server for a checkout of the repository; both read their tool definitions from
[`tools/mcp-tools.json`](../tools/mcp-tools.json). Credentials are never tool arguments.
The server exposes only `get_turn`, `submit_turn` and `get_building_tree` (the public
building tree, also at `GET /api/building-tree`); it cannot create matches, export
saves, name another seat or read a spectator view.

`get_turn` takes `{view, sections}`. The default `view: "brief"` returns a text briefing
of the seat (date, round length, people, goods, regions, standing orders, what can be
built, knowledge, practices, projects, forces, diplomacy, objectives, last round's
events: about 5,000 tokens for a large late-game civilization), the cursor, the seat's
standing orders, receipts, public action templates (`action_reference.examples` and
`.clauses`), limits, the seats the referee is waiting on and a `next` text. The briefing
comes first as plain text; the rest follows a `--- decision packet (JSON) ---` line as
JSON. `view: "full"` returns the complete permission-filtered observation, which can run
to several hundred kilobytes (over the tool-result limit of most agents), so name the
parts you need: `sections: ["regions"]`, `["catalog", "knowledge"]` and so on (any
top-level `Observation` field).

`submit_turn` takes `{cursor, request_id, actions, advance, view}` and returns the
receipts and the updated packet (brief unless `view: "full"`). `advance` is `none`,
`phase`, or `round`; the MCP default is `phase`. `none` only applies the actions, so an
agent can read the receipts and submit corrections before it finishes the phase. Use
`round` for a whole-round plan that intentionally passes remaining negotiation.
Negotiating adaptively still requires one exchange per window: future replies cannot
appear in an earlier round packet.

Rounds last up to fifty years. An order is carried out once; a **standing order**
(`{"kind": "directive", "op": "add", "directive": {...}}`: `build_target`,
`research_agenda`, `auto_research`, `reform_agenda`, `settle_target`) is re-checked every
January inside the round, so standing orders are an agent's main tool for what must keep
happening. The packet's `action_reference` and `next` say so.

The HTTP equivalents are `GET /api/turn?seat=N&token=T[&view=brief][&sections=a,b]` and
`POST /api/turn` with those fields plus `seat, token` (without `view` the HTTP packet is
the full one, as before). At most 32 actions are accepted in one batch.
Receipts remain per action: accepted actions stay applied when another fails,
and any rejection prevents automatic advance. `STALE_TURN` rejects a changed
observation before applying anything. An exact `request_id` retry returns its
original packet, while changing its payload returns `IDEMPOTENCY_CONFLICT`.
The latest 128 request results, bounded to 16 MiB of encoded payload, are cached in the running server; a single response exceeding that cap is not cached; reload/new-match
starts a new generation and process restart loses that cache. Read a fresh packet
after either event. Do not invent a new request ID merely because a response timed
out. Native/model-driven seats remain protected by the same authority checks.

### Bring your own agent

Give a seat the controller `external` (in setup: **Your own agent**). When the match
starts, the game shows that seat's token and ready-made configurations (also under
**Game menu → Connect your agent…**). The match waits for your agent at every phase.

Claude Code: save an MCP configuration such as

```json
{"mcpServers": {"before-the-stars": {"command": "/path/to/bts", "args": ["mcp"],
  "env": {"BTS_URL": "http://127.0.0.1:7878", "BTS_SEAT": "0", "BTS_SEAT_TOKEN": "<token>"}}}}
```

as `bts-seat-1.json` and run
`claude --mcp-config bts-seat-1.json --allowedTools mcp__before-the-stars__get_turn,mcp__before-the-stars__submit_turn`
(or add the server to a project's `.mcp.json`). Codex, for one session without changing
`~/.codex/config.toml`:

```sh
codex -c 'mcp_servers.bts.command="/path/to/bts"' -c 'mcp_servers.bts.args=["mcp"]' \
      -c 'mcp_servers.bts.env={BTS_URL="http://127.0.0.1:7878",BTS_SEAT="0",BTS_SEAT_TOKEN="<token>"}'
```

From a checkout, `node tools/mcp.mjs` with the same three variables works in either.
Then tell the agent to call `get_turn` and `submit_turn` when it is its turn. Without
`--require-tokens` the referee does not check tokens, so any program on the machine may
play a free seat; start it with `--require-tokens` to enforce them.

## Endpoints

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET /api/match` | | Match summary: round, month, phase, window, seats, who is being waited on |
| `POST /api/match` | `{seed, regions, horizon, pace_bp, controllers, disclosed_objective, public_seed}` (all optional) | Creates a match and returns its summary with tokens for external seats |
| `GET /api/observation` | `?seat=N&token=T` | The seat's `Observation` |
| `POST /api/actions` | `{seat, token, actions:[Action…]}` (at most 32) | `{receipts:[Receipt…]}` |
| `POST /api/ready` | `{seat, token, through_round}` | Match summary after the referee has advanced as far as it can |
| `POST /api/delegate` | `{seat, token, domains}` | Hands the listed domains of an external seat to a steward; returns the match summary |
| `GET /api/saves`, `POST /api/save`, `POST /api/load` | `{name}` | Named saves under `saves/` (see [saves.md](saves.md) for these and the other save routes) |
| `GET /api/savefile` | `?kind=manual\|auto&name=…&created=<ms>` | The whole session as a portable save file (`.btsave`, binary). Refused (403) when a seat is `external` or tokens are required: a save holds the entire world |
| `POST /api/savefile/describe` | the file as the body | What the file is and whether it would load; loads nothing |
| `POST /api/savefile/import` | the file as the body | Replaces the match and returns its summary with tokens. The file is verified, unpacked within its limits and rehearsed first; a refused file (`400 INVALID_SAVE` with a `reason`) leaves the match in progress untouched |
| `GET /api/session/export` | | The whole session as bare save text (what a save file holds inside). Refused (403) like the save file |
| `POST /api/session/import` | the save text as the body | Replaces the match and returns its summary with tokens. The save is checked and rehearsed first; a refused save (`400 INVALID_SAVE`) leaves the match in progress untouched |
| `GET /api/export/chronicle` | `?seat=N&format=md\|json` | The seat's own chronicle |
| `GET /api/building-tree` | | The public building tree (protocol 2.3): every building, line, stage and upgrade edge, technology requirements masked to era and field, sealed content absent. No token: it is the same for every seat and match of the content version. Turn packets carry `building_tree_hash`, and the tree itself when `known_tree_hash` (query or submission field) differs, or in the first round when none is given |

`controllers` is a list of two to ten of `"human"`, `"external"`, `"easy"`, `"medium"`,
`"hard"` and the model-driven controllers below. The current standard CLI configuration uses 60 Earth-like regions and the 525-round
historical calendar; map-size limits follow the running host's configuration. The old
2,880-month/960-month horizons are development fixtures, not the standard calendar.
The CLI `--horizon` selects a fixture calendar; do not assume it is equivalent to an
HTTP field without checking the current MatchConfig contract. With
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
| `set_policy` | any | Food reserve, labour weights, mobilization share, enable a facility, rename, move capital, and the production method of a facility in a region (`{"kind": "method", "region": 12, "facility": "steelworks", "method": "electric"}`; `"method": null` returns the choice to the works; the keys are those of `catalog.facilities[].recipes`) |
| `start_project` | any | `build`, `research`, `survey`, `settle`, `study`, `resettle`, `recruit`, `religion`, `ftl_trial`, `ftl_deployment`, `ftl_replacement` |
| `manage_project` | any | `pause`, `resume`, `cancel`, and priority 0–9 (lower first) |
| `investigate` | any | Follow up a lead |
| `propose_reform`, `repeal` | any | Enact a recognized practice whose requirements are met; repeal an enacted one |
| `directive` | any | Standing orders, re-checked every January inside the round: `op` `add` (with `directive`: `build_target`, `research_agenda`, `auto_research`, `reform_agenda`, `settle_target`; one standing for the same thing is replaced), `remove` or `move` (with `id`, `position`) |
| `start_program`, `manage_program` | any | Education programmes |
| `demolish`, `military_order`, `forfeit` | any | |
| `enter_era` | any | Enter the next era once every condition of `era.next.conditions` holds (`era.next.eligible`); the crossing starts at once (protocol 2.2) |
| `choose_charter` | any | `{"kind": "choose_charter", "charter": "academies"}`: hold a charter of the present era (`era.charters[].key`); with the places full it replaces one at the cost stated in `era.charter_note` |
| `choose_tradition` | any | `{"kind": "choose_tradition", "slot": "machine", "path": "steam"}`: commit an offered slot (`machine` from the Industrial era: `steam`, `engine`, `wire`; `frontier` from the Information era: `atom`, `network`, `living`, `synthetic`); from another path it starts a tradition reform project |

Clause kinds: `goods`, `knowledge`, `practice`, `maps`, `non_aggression`,
`defensive_pact`, `peace`, `subordination`, `cede_region`, `secondment` (lend
qualified people) and `joint_programme` (share a programme facility). `months: 0` on
`non_aggression` or `defensive_pact` makes it open-ended; `break_treaty` with
`notice: true` ends such clauses at the close of the next round without a breach.
`set_policy` `war_policy` (`accept_white_peace_after_months`, `accept_cession_max`)
lets an armistice come into force inside a long round. A clause may reference only
technology or practice handles present in the proposer's own observation.

Example batch:

```json
{"seat": 0, "token": "", "actions": [
  {"kind": "start_project", "spec": {"kind": "build", "region": 12, "facility": "fields", "levels": 2}, "priority": 2},
  {"kind": "investigate", "lead": "k03fa91c"},
  {"kind": "start_program", "region": 12, "course": "E002", "seats": 8000},
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

The referee can run a language model in a seat itself. In `POST /api/match`, use one of
these `controllers` values, with optional per-seat `agent_options`:

| Controller | How it runs | Sign-in |
| --- | --- | --- |
| `claude-code` | **Agent** (recommended). The local `claude` runs as an agent with the game's MCP server bound to the seat and plays through `get_turn`/`submit_turn` | `auth: "login"`: that CLI's own sign-in (a Claude subscription); `auth: "api_key"`: `api_key`, given to the CLI's environment only |
| `codex` | **Agent**. The local `codex exec` with the game's MCP server for that run only | `auth: "login"`: that CLI's own sign-in (ChatGPT); `auth: "api_key"`: `api_key` as `CODEX_API_KEY` in its environment |
| `claude-api` | **One-shot**. Claude over the Messages API (default model `claude-opus-5-5`, adaptive thinking, the rules prompt cached) | `ANTHROPIC_API_KEY` in the referee's environment, a profile from `ant auth login`, or `api_key` |
| `openai-api` | **One-shot**. Any OpenAI-compatible chat-completions endpoint | `OPENAI_API_KEY`, or `api_key`; `base_url` selects the endpoint; `model` is required |

```json
{"controllers": ["human", "claude-code", "codex", "claude-api"],
 "agent_options": {"1": {"model": "claude-sonnet-5-5", "effort": "medium", "max_usd": 0.5},
                   "2": {"model": "gpt-6-astra", "consult_every": 2},
                   "3": {"model": "claude-opus-5-5", "consult_every": 5}}}
```

`agent_options` fields: `model`, `effort` (`low` … `max`), `consult_every` (ask the model
every N rounds; default 1), `auth` (`login` or `api_key`, for the CLI agents), `api_key`,
`base_url`, and the cost guard: `budget_seconds` (time one consultation may take; default
300), `max_calls` (game tool calls per consultation; default 12), `max_usd` (Claude Code's
`--max-budget-usd` per consultation; default 0.50), `max_tokens` (output tokens of a
one-shot reply; default 16,000) and `max_failures` (failed consultations in a row before
the seat stops; default 3). A key sent here is kept in memory only: it is never written to
a save, a log, the agent log or the match summary, reaches a CLI only through its
environment (never its command line), and is scrubbed from error text. A `base_url` is
saved without user information or query, either of which could carry one.

**Agent seats.** When the referee waits on the seat, the worker starts the CLI in an empty
temporary directory with a token that admits that seat for this consultation only
(`409 TURN_OVER` once it ends) and the prompt "It is your turn". The agent reads its
brief packet, decides, submits with `advance: "none"`, reads the receipts, corrects and
finishes with `advance: "phase"`, then answers with `{"note", "delegate"}`. The exact
invocations:

```sh
claude -p --output-format json --system-prompt <rules> --mcp-config mcp.json --strict-mcp-config \
       --tools "" --allowedTools mcp__bts__get_turn,mcp__bts__submit_turn \
       --no-session-persistence --disable-slash-commands --max-turns <calls+4> --max-budget-usd <usd> \
       [--model M] [--effort E] [--bare]          # --bare (and ANTHROPIC_API_KEY) only with auth api_key
codex exec --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules -s read-only \
       --color never --json -C <tmp> -o <tmp>/last-message.txt [-m M] [-c model_reasoning_effort="E"] \
       --disable shell_tool --disable unified_exec --disable apps --disable plugins --disable browser_use \
       --disable computer_use --disable image_generation --disable multi_agent -c web_search="disabled" \
       -c mcp_servers.bts.command="<bts>" -c 'mcp_servers.bts.args=["mcp"]' \
       -c 'mcp_servers.bts.env={BTS_URL=…,BTS_SEAT=…,BTS_MAX_CALLS=…}' -c 'mcp_servers.bts.env_vars=["BTS_SEAT_TOKEN"]' \
       -c 'mcp_servers.bts.enabled_tools=["get_turn","submit_turn"]' -c mcp_servers.bts.default_tools_approval_mode="approve" -
```

`mcp.json` (written with owner-only permissions into the temporary directory) starts
`<bts> mcp` with `BTS_URL`, `BTS_SEAT`, `BTS_SEAT_TOKEN` and `BTS_MAX_CALLS`. Claude Code
also gets `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; with
`auth: "login"` any `ANTHROPIC_API_KEY` of the referee's environment is removed so the
person's subscription is used. Neither CLI's global configuration or login is read for
tools or changed.

**One-shot seats.** Each time the seat is consulted the referee renders its own
observation as the same text briefing and asks for one JSON object: a short note, the
domains to delegate to the steward, and up to 24 ordinary actions. Invalid actions are
rejected individually and reported in the agent log.

**Failures.** A consultation that fails is retried with backoff (5 s, then 20 s) unless the
error is one a retry cannot fix (a missing program, an expired sign-in, a model the account
does not offer, a missing key). Then the steward plays that round (`steward_took_over` in
the log) and the seat's own delegation comes back with its next success. After
`max_failures` failures in a row the seat is `stopped` and the steward runs it alone until
`POST /api/agent/control {"seat": N, "op": "resume"}` (the observer console's **Resume**);
`"op": "stop"` stops consulting a seat. The model sees nothing but its seat's own
observation; the CLIs' file, shell and web tools are off and their output is treated as
untrusted (every order is validated by the referee like anyone else's).

| Method and path | Body or query | Returns |
| --- | --- | --- |
| `GET /api/agents/providers` | `?refresh=1` to skip the 30 s cache | Whether `claude` and `codex` are installed and signed in (`claude auth status`, `codex login status`), the models Codex offers (`codex debug models`), which key variables are set (booleans), and the MCP command. No model is called; nothing personal is passed on |
| `POST /api/agents/test` | `{provider, model, effort, auth, api_key, base_url}` | One tiny real call with these settings (for the CLIs, with the game's MCP server started too): `{ok, reply, seconds, cost_usd, tokens, mcp}` or `{ok: false, error, hint}`. One test at a time |
| `POST /api/agent/control` | `{seat, op: "resume" \| "stop"}` | Match summary. Refused when tokens are required |

Each seat in the match summary carries `agent: {provider, model, consult_every, state,
last_note, calls, last_error, last_hint, thinking_seconds, mode, errors_in_row,
max_failures, spent_usd, tokens, budget_seconds}` (`state` is `idle`, `thinking`, `error`
or `stopped`; `mode` is `agent` or `oneshot`). Agent log entries add `date`, `hint`,
`attempts`, `tool_calls`, `turns`, `cost_usd`, `tokens` and `steward_took_over`.

## Stewards

A human or external seat may delegate any of `economy`, `research`, `education`,
`culture`, `expansion` and `military` to a steward. A steward is the native Medium
policy restricted to those domains. It acts once per round at the end of the plan
phase, from that seat's own observation and through ordinary actions, so its receipts
appear with the seat's own. An empty `domains` list ends the delegation. Diplomacy is
never delegated.

## Reading an observation

- Head counts are real people: populations, labour, qualification holders, posts
  (`jobs[].count`), soldiers and programme places. A seat starts with about 240,000
  people; a settling party is 20,000 to 400,000 people, a formation 1,000 to 5,000,000
  soldiers, a programme 1 to 2,000,000 places.
- Goods, work, power and research are integer base units: one ration (a person's food
  for a month), tonne or standard lot of a good; one worker-month or researcher-month
  of work; 0.1 MWh of shaft or electric service. 1,000 base units make the display
  unit that amounts are normally quoted in. Catalog amounts stated per person (course
  materials, formation equipment and upkeep) are per thousand people. `units` in every
  observation states the food ration, the display divisor, the unit and mass of each
  good, the settlement class bounds and the limits above; see
  [`units-and-scale.md`](units-and-scale.md).
- Shares are basis points; months are absolute simulation months.
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
