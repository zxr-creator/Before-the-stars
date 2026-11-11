# Implementation status against the v1.0 design

The design documents in this directory remain the specification. This file records how
the playable implementation in `crates/` and `apps/web/` relates to them. "Abstracted"
means the mechanism exists in a simpler form with the same strategic feedback;
"not built" means it is absent.

| Design area | Status | Notes |
| --- | --- | --- |
| Clock and rounds (30 §3, 36 §2) | Implemented | One simulation month. Since ruleset 3.0 a historical calendar: the standard game runs 525 rounds from 5000 BC to AD 2500 (rounds of 50 years down to 2), the quick game 230 rounds on the same dates, and fixture clocks serve tests (`docs/units-and-scale.md` section 11). Contact → five negotiation windows → plan → resolve; standing orders act inside long rounds |
| World generation (08) | Implemented, simplified | Seeded Voronoi regions (24/48/72), elevation and moisture noise, downhill rivers, coasts and sea links, correlated deposits, viable starts with guaranteed reachable copper, iron, coal and rare minerals, three fixed test nodes. Derivation uses a keyed integer hash rather than HMAC-SHA256; `public_seed: false` mixes in server entropy |
| Economy and production (02, 21) | Abstracted | About sixty facility types carry the 34 recipes and 10 capital modules with inputs, shaft/electric/compute services, upkeep, condition and storage throttles. Goods are pooled per civilization with a per-region carriage efficiency set by transport grade and distance, not per-shipment logistics. No prices, money or private balance sheets: the limit on what a government can direct is the callable-labour share raised by institutions |
| Industrial traditions (22) | Implemented as content | Water/wind, steam, diesel and electric power are separate facilities with real fuel and site limits; generators, grids and motors bridge them; fission, fusion and orbital power follow. No route skips electricity, electronics, computing or orbit |
| Population (32) | Implemented, simplified | Sparse blocks keyed by region × lineage × religion with 81 annual age cells, nine-month lagged birth intensity, one combined mortality calculation, annual ageing, migration that moves real counts. One access class per region; qualifications are counted per region rather than per block |
| Education (19, 32 §8) | Implemented | All 24 courses with entrants, teachers, class sizes, venues, materials and months. Students and teachers leave the labour pool; graduates are usable next month; founding cohorts teach themselves slowly. Authorization states (review due, dormant) are not modelled |
| Knowledge (31) | Implemented | Fixed 138-node graph loaded from the atlas; states hinted → discovered → investigating → understood → prototyped → adopted; evidence from actual sector activity, contact and paid exploratory studies; research classes need qualified staff and facilities; licences shorten work but never create operators. T048/T117/T121 corrections applied |
| Culture (07, 18, 31 §6) | Implemented, simplified | Fixed 64-practice graph; recognition by people living with the prerequisites, reform with real requirements, gradual adoption shaped by eight private tendencies with 150/500 basis-point yearly drift limits; observed traits need sustained behaviour. Adoption is tracked per civilization, not per local lineage. C045/C047 corrections applied |
| Religion (10) | Implemented, light | No religion at start; movement → tradition → precinct → recognized founder → founding with four fixed beliefs; three founding slots per world; fictional names; spread by local and neighbouring contact |
| Politics (04) | Abstracted | Stability, administrative load and capacity, unrest and callable labour carry faction effects. Factions are reported with weights, support and demands but do not hold separate assets or veto powers |
| Diplomacy (29) | Implemented | Three counterparts, mutual channels, five simultaneous windows, ten envelopes per pair, protected withdraw/decline/break, structured treaties with performance records and trust. Since ruleset 2.0 slice E treaties can second experts (real people who move and come home) and share a launch complex, orbital yard or high-energy laboratory under a joint programme (`docs/units-and-scale.md` section 8). Evidence attachments and multilateral treaties are not built |
| Contracts (14) | Abstracted | Goods deliveries with shortfall records, knowledge, practice and map transfers, pacts, subordination, cession, secondment of experts and joint programmes (with their own performance records: people sent, owed, returned and kept behind; months served and shortfalls). Custody, collateral and staged acceptance are not built |
| Warfare (05, 13) | Implemented, simplified | Six tiers × three roles with the published counter matrix, 2.5^tier, proficiency, supply and morale; simultaneous losses, retreat, five-month capture, six-month sovereignty transfer, militia, elimination. Fronts, frontage and prisoners are not modelled |
| Victory (15, 33) | Implemented | G96 ∧ F24 ∧ Trials96 checked monthly; subordination counts only while real; a broken window restarts; reward 2 − T/H or −1; horizon and all-ineligible endings. Since ruleset 2.0 slice E fleet-wide jump capability also needs separate educational, scientific, industrial and logistical bases measured against the installed works, none of them a population threshold; contracted imports, seconded experts and a partner's launch, orbital-yard or laboratory service can stand in for parts of them while their treaties last (`docs/units-and-scale.md` section 8) |
| Information boundary (06, 02) | Implemented | Observations are projected per seat before serialization; unknown nodes do not appear; opaque per-seat handles; uniform errors for unknown and nonexistent references; foreign estimates are coarse and stable within a year |
| Native AI (33) | Implemented | Deterministic, non-LLM, protocol-only crate. Difficulty changes candidate actions per round (12/24/48), preparation horizon and offer margins; no resource or information bonus. It is a bounded rule-and-scoring policy, not the forward-search planner sketched in the design |
| Agent access (technical/02, 04) | Partly | HTTP API and CLI with seat tokens. MCP adapter, generated SDKs, idempotency keys and isolated runner images are not built |
| Language-model seats | Built, unverified against real models | A seat can be driven by Claude over the Messages API, the local `claude` or `codex` command, or an OpenAI-compatible endpoint. Each consult sends that seat's own observation as a briefing and applies the returned actions; the built-in steward covers what the model leaves out. Three consecutive failures stop the seat. Only a scripted stand-in provider has been run end to end |
| Observer mode | Implemented | A match with no human seat exposes a referee-wide spectator view, a scoreboard, world events, playback control (step, play, run ten), each seat's own view read-only and each model's notes. Refused when a human seat exists or seat tokens are required |
| Interface and chronicle (34) | Mostly | 3D diorama map with four lenses and a flat atlas fallback; technology and civics trees limited to discovered nodes; economy ledger (market, production, chains, workforce, balance sheet); title screen, setup, tutorial (24 steps) and almanac (21 topics); Historic Moments timeline with Markdown/JSON export. Post-match world timeline and counterfactual replay are not built. Seasonal map grading and further lenses are not built |
| Languages | Implemented | English, Simplified Chinese, Traditional Chinese (derived from Simplified with a regional phrase table and overrides). Server-generated text is translated in the client by template; an automated harvest of several full matches found no untranslated string, but 41 rare event templates were never seen in context and no native-speaking reviewer has read it. Generated region names stay in Latin script |
| Desktop application | Built; Windows unverified | `bts` opens the game in a native window (system WebView) with the referee in-process, full screen, per-user saves and a title screen. `scripts/package.sh` produces a universal macOS disk image and a Windows x64 zip; a GitHub workflow builds both natively plus a Windows installer. The macOS app has been launched here; the Windows executable and the workflow have never been run. Nothing is code-signed |
| Multicore (technical/03) | Partly | Independent matches run in parallel across cores; a single match is fast enough to settle a full 240-round game in about two seconds single-threaded, so in-match staged parallelism is not implemented |
| Persistence | Implemented | Full checkpoint saves including controller memory; state hashes; `bts verify` checks repeatability and checkpoint recovery |
| Conservation (`docs/conservation-audit.md`) | Implemented | Goods, people, qualified people, service, work and deposits each have a ledger and an identity; every source is listed with what backs it. The referee can record its books every month (`Match::record_ledgers`), and scripted and all-AI matches are audited month by month over whole campaigns. Capacities (water, care, storage, venue places, transport grade, generator and grid capacity) still depend on works existing rather than on their staffing |

## Ruleset 3.0 (design chapter 36) progress

Branch `ruleset3`. Slices are recorded here as they land; calibration outputs are in
`docs/calibration/ruleset3-slice-*.txt`.

- **Slice 0, tooling (done).** `bts run --curve FILE.csv` writes one row per seat at
  the start of every decade (population, regions, technologies understood by tier,
  research capacity and use, traded tonnes, births and deaths over the decade, food,
  soldiers, and the era milestones of design table 2.7) from a referee-side recorder
  (`bts_engine::curve`, never saved, never served to a seat); `--matches M` runs
  matches on a worker pool (`--threads`, `--first`) into one CSV. `--checkpoints DIR
  --at m1,m2,...` saves the match at the first round boundary at or after each month.
  `cargo run --release -p bts-host --example bench -- SAVE [--rounds N] [--policy]`
  measures p50/p95 per round and the mean per month from a save.
  `scripts/curve_summary.py` summarizes a curve (population by date, regions, era
  milestones, growth checks). The ruleset 2.0 baseline is
  `docs/calibration/ruleset3-slice-0-baseline.txt`.
- **Slice 1, calendar and standing orders (done).** `bts_engine::calendar` (standard
  525 rounds, quick 230, fixtures), signed historical years with no year zero,
  `date`/`calendar` on `Observation`, `SpectatorView` and the host's `MatchSummary`
  (and the portable save header), the reward counted from AD 1900, standing orders
  (`Action::Directive`: build targets, research agenda, automatic research, reform
  agenda, settlement targets), treaty terms scaled to the round with open-ended
  clauses and notice, war only in a round's first month, war policies and armistice,
  round recap flags and one era summary per round in the chronicle (at most 2,000
  entries per seat), briefings counted by kind, dates instead of month numbers in
  every engine text, ruleset `bts-rules/3.0.0` with the named refusal of 2.x saves.
  The native AI writes standing orders in rounds longer than a year, reads round
  totals per year, keeps clause terms within the round's bounds and may place up to
  four times its candidate actions in long rounds. `bts run --calendar quick`,
  `--checkpoints DIR` (era saves at 1000 BC, AD 1000, 1700, 1900, 2100 by default)
  and `examples/decide` (one seat's plan and the referee's answers). Calibration:
  `docs/calibration/ruleset3-slice-1-*.txt`.
- **Slice 2, population (mechanics done; calibrated together with slice 3).** Ruleset
  3.0 mortality bands and technology factors, care, crowding, town conditions with
  sanitation coverage, epidemics (`sim::outbreaks`, addressed draws per region and
  month, spread to neighbours, immunity), harvest variance, `F_custom x F_food x
  F_crowd x F_dev` fertility with the Fruitful Households and Day of Rest doctrines,
  deaths by cause, arable land x3 and fields to 250 levels, field methods v3, food
  synthesis works, deposits x5-10 with the larger guarantees, the Megalopolis class,
  `u64` population sums (`docs/units-and-scale.md` section 3). Population depends on
  when the medical and agricultural nodes arrive, so its constants are calibrated
  after slice 3 sets the knowledge pace; `docs/calibration/ruleset3-slice-2-eval.txt`
  records the state with ruleset 2.0 knowledge pacing.

## Known calibration gaps

- All numeric parameters are first-pass values tuned only through all-AI matches.
- Late-game supply chains (fuel, spares, compute) are fragile for the native opponents.
- In all-AI matches the leader conquers or subordinates rivals after the objective is
  revealed, but no seat has completed global integration within the horizon.
- The client was verified by automated runs; religion founding, battles and the
  jump programme screens were built from the protocol types and have not been exercised
  by hand.
- The 3D map has only been rendered with software WebGL in automated runs. Its frame
  rate on real hardware, and on integrated graphics in particular, is unmeasured.
- The client does not yet show `GoodLine.lost` (spoilage and carriage loss), and its
  ledger still treats `produced` as what reached the stock; since ruleset 2.0 slice B
  `produced` is gross output where it is made. The facility descriptions and recipe
  notes that explain deep and shallow workings are new English strings without
  translations.
- Service rationing is strict since slice B: an understaffed, underpowered works runs
  at the product of the two shares, not the lesser. All-AI matches end with about the
  same technology and a few percent fewer people than before (`docs/calibration/`).
- Construction since ruleset 2.0 slice C needs a qualified site crew, site power and
  a minimum duration besides goods and work (`docs/units-and-scale.md` section 6), and
  each region has an ordered construction queue. The client does not yet show the
  quote's crew, site power and minimum months, the queue or the `position` of
  `manage_project`; the new blockers ("Site crew short: ...", "Site power short: ...")
  and receipts are English strings without translations. Sites are not fed from the
  grid, and the native opponents do not move people to a thinly peopled test node
  whose call-up cannot hold a deployment node's crew. In all-AI matches the last
  technologies arrive some twenty rounds later than under slice B, because the
  installations their investigation needs take three to five years each to build
  (`docs/calibration/`).
- Production methods can be chosen by region since ruleset 2.0 slice D (`set_policy`
  / `method`), fields included, and works that stand together share support posts,
  repair works and carriage within the region's freight capacity
  (`docs/units-and-scale.md` sections 4 and 7). The client does not yet show or set
  a method, nor show `OwnRegion.infrastructure` (freight load and capacity, the
  savings, congestion loss); the fields' catalog entry now carries recipe views,
  which the client's production screens were not written for. The new method names,
  the field-method notes and the receipt reason "unknown facility or method" are
  English strings without translations. The native opponents do not yet move works
  out of a region congested at the top transport grade; in all-AI matches about a
  quarter of capitals end above it, losing up to 7% of what they send
  (`docs/calibration/`).
- The space and jump base since ruleset 2.0 slice E (`docs/units-and-scale.md`
  section 8, design chapter 35): the jump checks carry a `category`, treaties carry
  `secondments` and `programmes` views, goods lines carry `withheld`, and two clause
  kinds (`secondment`, `joint_programme`) exist. The client mirrors them in
  `apps/web/src/protocol.ts` (the clauses as a separate `CooperationClause` type, so
  that the diplomacy panel's exhaustive tables still compile) but shows none of them
  and cannot propose the new clauses; the new check labels and details, clause
  summaries, treaty performance lines, briefings and chronicle entries are English
  strings without translations. The high-energy laboratory draws 1,000 units of
  electricity instead of the design table's 3,000 (the first one must run before
  fission is understood). No native seat completes the victory contract under the new
  base in the eval set; the commonest failures are the jump works themselves and the
  year of flight hardware. In the riverland world the easy seat, which has no copper,
  ends at 89 technologies instead of 121 (`docs/calibration/slice-e-*.txt`).
- The economy ledger's own estimates (marked as such in the interface) agreed with the
  referee's totals to within about 25% in 41 of 57 comparisons; the rest diverge more.
