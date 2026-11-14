# 43. Simple agent access and decision packets

Date: 2026-11-13. **Next-design specification; proposed controls are not yet shipped.**
See [Agent API](../agent-api.md) for current endpoints. Reuse the existing Rust host.

## 1. Three entry paths, one contract

The game already has managed Codex/Claude Code, direct Claude/compatible APIs, external
seats, a connection screen and integrated turn MCP. The default MCP loop already has
two tools, `get_turn` and `submit_turn`; `get_building_tree` is optional. Simplify setup
and decision semantics, not by adding one tool for every action.

| UI choice | User supplies | Game handles |
| --- | --- | --- |
| Installed coding agent | Codex or Claude Code, supported sign-in, model/budget | Detect, capability-check, launch managed CLI and run the seat loop |
| Existing agent app/CLI | External seat and a short-lived invitation | Scoped generated connection setup for supported clients, same two tools |
| Model API | Provider/custom endpoint, model, key and spending limit | Provider adapter, same decision packet and validated structured submission; no MCP installation |

Use Detect, Test, Start, Pause, Reconnect and Revoke controls. Normal setup should not
require editing JSON-RPC, phase numbers, tokens or a long shell command. Keep advanced
configuration inspectable. Pairing secrets are single-use and short-lived; exchange
them for scoped credentials, not permanent public URLs.

A game desktop app launching a CLI differs from a Codex/Claude desktop app connected
as an external client. Test each supported surface/version. A cloud app cannot access
the player's localhost without a reachable authenticated bridge.

Support DeepSeek first through direct compatible APIs. A coding CLI using another
provider is a separately tested opt-in profile: dialect, schemas, streaming and auth
must work for that CLI/version. Changing `base_url` does not guarantee compatibility.
Subscription CLI login and independently billed API keys are different choices.

Proposed shell facade: `bts agent connect`, `observe`, `submit`, `status`. These are
design names, **not current commands**. It serializes the same packet and submission
as MCP/HTTP. Adapters manage cursors and IDs; uncertain retries must never be silently
turned into fresh requests.

## 2. One exchange per decision point

Keep `get_turn`/`submit_turn` and identical semantics through HTTP, MCP, managed CLI
and APIs. Usually a decision point covers a whole planning round. Actual negotiation
replies can create additional decision points; no packet can contain future replies.

The runner may pass empty windows under the seat's standing communication policy.
New messages/offers and required choices stop it. It cannot auto-sign, declare war
or choose research just to reduce calls. An explicit whole-round pass waives remaining
negotiation opportunities. Retain five windows, three contacts, ten combined pair
envelopes per round. Queries, corrections and retries are not diplomatic messages.

| Packet group | Required content |
| --- | --- |
| Identity/clock | Match generation, seat, schema/rules versions, cursor, date, elapsed and next-round months, decision kind, readiness |
| Summary | Food, population, employment by broad education, production/consumption, reserves, research, institution capacity |
| Changes/attention | Finished/failed work, diplomacy, graduates, observable shocks, actionable bottlenecks and mandatory choices |
| Standing plans | Construction, research, reforms, institution budgets, reserved inputs, priorities and stop conditions |
| Knowledge | Discovered options, known requirements, evidence quality and observed alternatives |
| Endgame | After discovery only: stage, delivered inputs, operational assets and remaining trial requirements |
| Diplomacy | Inbox, versioned offers, contact/message allowances and binding commitments |
| Actions | Typed visible actions, actual known handles, units, ranges and valid examples |
| Continuation | Per-action receipts, next required decision, available detail sections and explicit omissions |

Cover era, market and space whenever visible. Current `SECTIONS` and MCP enum omit
these despite their presence in Observation, and brief rendering lacks dedicated
summaries. Update them together. Submissions must accept the same section selectors
as reads. Generate coverage tests from authoritative types. Institutional education
reports output/funding, not mandatory courses to open.

Default packets target 3,000–6,000 tokens, measured across eras. Cache static material
by hash; page optional detail; include structured quantities and units beside readable
summaries. Never silently truncate unresolved commitments, imminent failure, required
choices or receipts. Human panels use the same projected facts. An early action menu
must not advertise hidden FTL facilities or late-game specific project targets.

## 3. Actions, errors and retries

Retain batches with advance intent; add stable per-action IDs and declared limits.
Use a discriminated action union, including institution funding/focus. Generate examples
within legal scale; current examples such as 30-person settlement cannot teach actions
whose minimum is tens of thousands. Placeholders must be visibly marked as such.

Initially retain current ordered, non-atomic semantics: accepted actions remain applied;
rejected actions change nothing; any rejection prevents automatic advance. Return each
status, generated handle, observable reason and repairable fields. Corrections resubmit
only failures. Unknown and inaccessible handles have indistinguishable errors. Do not
make one adapter atomic while another applies partial batches.

Maintain a bounded durable submission journal or reject expired ambiguous retries.
An identical acknowledged request returns its result; changed payload under the same
ID fails. After cache eviction/restart, reconcile authoritative action IDs/generation
before acting; never duplicate spending after a timeout. Format repair does not advance
time or reveal more state. Do not execute model-provided code as a game plan.

## 4. Managed agents and APIs

Give direct models the same packet, request schema JSON or a function call, and let
the provider adapter translate envelopes. The Rust host validates all actions.
Capability-check structured output/tool calling, output limits and timeout behavior.
Do not assume all compatible APIs support every optional field. Model IDs remain
configurable rather than frozen to an assumed latest model.

Preserve bounded per-seat memory: goals, dated observations, uncertain beliefs and
commitments. Reconnection reconciles it with current state/receipts. Avoid both endless
transcripts and restarting every consultation with no strategic memory. New games do
not inherit hidden state or another seat's notes.

Official references checked for this design: [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)
documents `codex exec` and schema output; [Codex MCP](https://developers.openai.com/codex/mcp)
documents stdio and authenticated HTTP options. [Claude Code programmatic use](https://code.claude.com/docs/en/headless)
documents `claude -p`, structured outputs and session continuation. [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/)
illustrate a model returning calls for the host to execute. These are building blocks,
not live validation of every game adapter or desktop surface.

## 5. Hosting and evaluation boundaries

GitHub Pages runs the WASM game locally, but cannot launch local CLIs, host remote MCP
or protect a key embedded in JavaScript. Show when a local bridge is required; use a
hosted referee for remote competitive agents. Optional browser own-key experiments
are local play, not secure ranked evaluation.

External matches require seat authentication by default. Admin endpoints, full saves,
spectators and hidden content have separate capabilities. Open-source code and local
WASM cannot be made secret from the machine owner. Official discovery benchmarks need
an isolated/remote referee and restricted agent environment; instructions alone are
not isolation. Previously trained models may know the fixed graph: label the informed
track rather than claiming guaranteed ignorance.

Opponent prose is untrusted game data: deception is allowed, instructions to steal
credentials or change the harness are not. Credentials belong in a local secret store
or server environment, never saves, browser cache, logs, invitation text or arguments.
Connection tests say whether they make a paid call and remain bounded.

On provider failure, casual play pauses and offers explicit steward takeover. Evaluation
records infrastructure truncation; it never silently counts a native takeover as LLM
success. Keep assisted results separate. Authentication failures do not advance turns.

## 6. Acceptance

- Fresh local Codex/Claude setup plays without editing a config file; unsupported
  versions yield a clear capability error rather than a half-working session.
- Existing app/CLI joins, reconnects and revokes a seat; cross-seat/admin requests fail.
- Direct compatible DeepSeek API completes a small fixture; invalid output repairs
  without duplicate actions. Test provider/version behavior rather than assuming it.
- Quiet rounds need one substantive model decision; negotiation stays causal/bounded.
- Era/market/space/education reach the brief or explicit bounded continuation, never
  require a huge dump, and never leak hidden graph or foreign truth.
- Partial rejection, retry, save reload and token rotation conserve spending and orders.
- Changing unrevealed graph metadata while keeping seat history identical must not
  change a discovery native policy or observation. An informed policy is separately labeled.
- Record setup time, tokens, calls/round, schema repairs, cost, completion and assistance.
  Live paid-provider compatibility testing remains implementation work, not a claim of this review.
